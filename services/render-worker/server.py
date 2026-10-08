#!/usr/bin/env python3
"""Authenticated deterministic render worker. No model/provider calls or URL fetching.
A persistent volume and an HTTPS reverse proxy are required for production hosting.
"""
import argparse, hashlib, hmac, io, json, math, os, re, shutil, sqlite3, subprocess, threading, time, zipfile, unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
FONT_SHA = '8718450eae59cfb3cdf6a92905835d5b406155c23a6425d4ed219f7de30f1762'
VERSION = 'woo-ffmpeg-render-4'
MAX_BYTES = 200 * 1024 * 1024
FONT_CODEPOINTS = frozenset(json.loads(Path(__file__).with_name('font-codepoints.json').read_text()))

def digest(data): return hashlib.sha256(data).hexdigest()
def stamp(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
def positive(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value <= 0: raise ValueError('Invalid duration')
    return float(value)
def source_in(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value < 0 or value > 86400: raise ValueError('Invalid source in')
    return float(value)
def command(args, cwd, name, timeout=900):
    result = subprocess.run(args, cwd=cwd, capture_output=True, timeout=timeout)
    (cwd / (name + '.log')).write_bytes(result.stderr)
    if result.returncode: raise ValueError('FFmpeg stage failed: ' + name)
    return result.stdout

def probe(path):
    p = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,wav,mp3,ogg,aac,flac,matroska,image2,png_pipe,jpeg_pipe,webp_pipe', '-show_format', '-show_streams', '-of', 'json', str(path)], capture_output=True, timeout=30, check=True)
    return json.loads(p.stdout)

def captions_ass(raw):
    events=[]; previous=0
    def seconds(value):
        h,m,s,ms=map(int,re.split('[:,]',value))
        if m>=60 or s>=60: raise ValueError('Invalid subtitle time')
        return h*3600+m*60+s+ms/1000
    def ass_time(value):
        return f'{int(value//3600)}:{int(value%3600//60):02}:{value%60:05.2f}'
    for block in re.split(r'\n\s*\n',raw.replace('\r','').strip()):
        lines=block.split('\n'); match=re.fullmatch(r'(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})',lines[1] if len(lines)>1 else '')
        if not lines[0].isdigit() or not match: raise ValueError('Invalid SRT')
        start,end=map(seconds,match.groups())
        if start<previous or start>=end or end>30: raise ValueError('Subtitle outside timeline or overlapping')
        previous=end; text='\n'.join(lines[2:]).strip()
        if not text: raise ValueError('Empty subtitle')
        if any(not c.isspace() and ord(c) not in FONT_CODEPOINTS for c in text): raise ValueError('Subtitle contains unsupported glyphs; replace them before rendering')
        wrapped=[]
        for paragraph in text.split('\n'):
            line=''; units=0
            for character in paragraph:
                width=2 if unicodedata.east_asian_width(character) in ['W','F'] else 1
                if units+width>28: wrapped.append(line);line='';units=0
                line+=character;units+=width
            wrapped.append(line)
        if len(wrapped)>2: raise ValueError('Subtitle needs more than two safe-area lines; split the cue')
        rendered='\\N'.join(x.replace('\\','\\\\').replace('{','\\{').replace('}','\\}') for x in wrapped)
        events.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{rendered}')
    return '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,WOO Noto CJK SC,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,0,2,64,64,180,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'+'\n'.join(events)+'\n'

def title_ass(text,start,end,max_lines):
    if any(not c.isspace() and ord(c) not in FONT_CODEPOINTS for c in text): raise ValueError('Cover/endcard unsupported glyphs')
    lines=[]
    for paragraph in text.split('\n'):
        line='';units=0
        for c in paragraph:
            width=2 if unicodedata.east_asian_width(c) in ['W','F'] else 1
            if units+width>30:lines.append(line);line='';units=0
            line+=c;units+=width
        if line:lines.append(line)
    if len(lines)>max_lines:raise ValueError('Cover/endcard exceeds safe text area; edit before rendering')
    safe='\\N'.join(x.replace('\\','\\\\').replace('{','\\{').replace('}','\\}') for x in lines)
    def tm(v):return f'{int(v//3600)}:{int(v%3600//60):02}:{v%60:05.2f}'
    return f'Dialogue: 1,{tm(start)},{tm(end)},EndCard,,0,0,0,,{safe}\n' if text else ''

class Renderer:
    def __init__(self, root):
        self.root = root.resolve(); self.root.mkdir(parents=True, exist_ok=True)
        (self.root / 'cache').mkdir(exist_ok=True)
        self.db = self.root / 'jobs.sqlite3'; self.wake = threading.Event(); self.stop = threading.Event()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project TEXT, input_sha TEXT, status TEXT, data TEXT, created_at TEXT, updated_at TEXT)')
            db.execute("UPDATE jobs SET status='queued' WHERE status='rendering'")
            db.execute('CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, project TEXT, job_id TEXT, package_sha TEXT)')
        self.thread = threading.Thread(target=self.loop, daemon=True); self.thread.start(); self.wake.set()
    def connect(self):
        c = sqlite3.connect(self.db, timeout=30); c.row_factory = sqlite3.Row; return c
    def update(self, id, status, data):
        with self.connect() as db: db.execute('UPDATE jobs SET status=?,data=?,updated_at=? WHERE id=?', (status, json.dumps(data, ensure_ascii=False), stamp(), id))
    def lookup(self, id, project):
        with self.connect() as db: row = db.execute('SELECT * FROM jobs WHERE id=? AND project=?', (id, project)).fetchone()
        if not row: return None
        return {**dict(row), 'data': json.loads(row['data'])}
    def request_lookup(self, request_id, project):
        with self.connect() as db: row=db.execute('SELECT job_id FROM requests WHERE id=? AND project=?',(request_id,project)).fetchone()
        return self.lookup(row['job_id'],project) if row else None
    def submit(self, raw, request_id=None):
        if not 0 < len(raw) <= MAX_BYTES: raise ValueError('Package size invalid')
        package_sha = digest(raw)
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            infos = z.infolist()
            if len(infos) > 70 or sum(i.file_size for i in infos) > MAX_BYTES or len({i.filename for i in infos}) != len(infos): raise ValueError('ZIP bounds invalid')
            for info in infos:
                if not re.fullmatch(r'(shot-package\.json|captions\.srt|READ-BEFORE-RENDER\.txt|fonts/[A-Za-z0-9.-]+|media/[A-Za-z0-9.-]+)', info.filename) or '..' in info.filename or info.is_dir(): raise ValueError('ZIP path invalid')
            pack = json.loads(z.read('shot-package.json')); project = pack.get('project_id')
            if not isinstance(project, str) or not re.fullmatch(r'[\w-]{1,200}', project): raise ValueError('Project invalid')
            timeline = pack.get('timeline', []); plan = pack.get('plan', {}).get('data', {})
            if not plan.get('consent') or not timeline or len(timeline) > 60 or not pack.get('script', {}).get('sha256'): raise ValueError('Approved plan/script required')
            if abs(sum(positive(x['duration']) for x in timeline) - 30) > .5: raise ValueError('Timeline must total 30 seconds')
            if len({s['id'] for s in timeline}) != len(timeline): raise ValueError('Duplicate shot ids')
            assets = pack.get('approved_assets', [])
            pictures = {x.get('shot_id'): x for x in assets if x.get('role') == 'picture'}
            if any(s.get('type') not in ['live', 'aigc'] or s['id'] not in pictures for s in timeline): raise ValueError('Missing shot media')
            for role in ['voice', 'music']:
                if len([a for a in assets if a.get('role') == role]) != 1: raise ValueError('Voice/music required for this renderer contract')
            for asset in assets:
                filename = asset.get('delivery_file', '')
                if not filename.startswith('media/') or filename not in z.namelist() or digest(z.read(filename)) != asset.get('sha256') or not asset.get('rights_note'): raise ValueError('Media hash/license preflight failed')
                source_in(asset.get('source_in', 0))
            if not plan.get('srt') or not plan.get('subtitle_source'): raise ValueError('Approved SRT/source required')
            ass=captions_ass(plan['srt']); composition=plan.get('composition',{})
            if composition.get('still_motion','hold') not in ['hold','slow_zoom']:raise ValueError('Still motion invalid')
            if composition.get('transition','cut') not in ['cut','fade']: raise ValueError('Transition invalid')
            card=composition.get('endcard_text',''); card_seconds=composition.get('endcard_seconds',3)
            if isinstance(card_seconds,bool) or not isinstance(card_seconds,(int,float)) or not 1<=card_seconds<=5: raise ValueError('Endcard duration invalid')
            card_ass=title_ass(card,30-card_seconds,30,12) if card else ''
            if card_ass: ass=ass.replace('\n\n[Events]', '\nStyle: EndCard,WOO Noto CJK SC,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,20,0,5,120,120,180,1\n\n[Events]')+card_ass
            cover_text=composition.get('cover_text',''); cover_ass=captions_ass('1\n00:00:00,000 --> 00:00:01,000\n合成')
            cover_ass=cover_ass[:cover_ass.index('Dialogue:')]+title_ass(cover_text,0,1,3).replace(',EndCard,',',Default,') if cover_text else ''
            font = z.read('fonts/WOO-CJKsc-Regular.otf')
            if digest(font) != FONT_SHA: raise ValueError('Pinned CJK font required')
            if not z.read('fonts/OFL-NotoSansCJK.txt'): raise ValueError('Font license required')
            sha=digest(json.dumps({'version':VERSION,'project':project,'project_revision':pack.get('project_revision'),'activity_revision':pack.get('activity_revision'),'script':pack['script'],'plan':pack['plan'],'timeline':timeline,'assets':assets,'font_sha256':FONT_SHA},sort_keys=True,ensure_ascii=False).encode());id='render-'+sha
            previous = self.lookup(id, project)
            if request_id:
                if not re.fullmatch(r'[a-f0-9-]{36}', request_id): raise ValueError('Invalid request id')
                with self.connect() as db:
                    db.execute('INSERT OR IGNORE INTO requests VALUES (?,?,?,?)',(request_id,project,id,package_sha))
                    receipt=db.execute('SELECT * FROM requests WHERE id=?',(request_id,)).fetchone()
                if receipt['project']!=project or receipt['package_sha']!=package_sha: raise ValueError('Request id conflict')
            if previous: return previous
            jobdir = self.root / id; jobdir.mkdir(exist_ok=True)
            for info in infos:
                dest = jobdir / info.filename; dest.parent.mkdir(exist_ok=True); dest.write_bytes(z.read(info.filename))
            (jobdir / 'captions.srt').write_text(plan['srt'], encoding='utf-8')
            (jobdir / 'captions.ass').write_text(ass, encoding='utf-8')
            (jobdir / 'cover.ass').write_text(cover_ass, encoding='utf-8')
            data = {'version': VERSION, 'stage': 'queued', 'synthetic': bool(pack.get('synthetic')), 'model_calls': 0, 'input_manifest_sha256': digest(z.read('shot-package.json')), 'package_sha256':package_sha, 'human_review': 'pending'}
            with self.connect() as db: db.execute('INSERT OR IGNORE INTO jobs VALUES (?,?,?,?,?,?,?)', (id, project, sha, 'queued', json.dumps(data), stamp(), stamp()))
        self.wake.set(); return self.lookup(id, project)
    def loop(self):
        while not self.stop.is_set():
            with self.connect() as db: row = db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
            if not row: self.wake.wait(1); self.wake.clear(); continue
            with self.connect() as db:
                if db.execute("UPDATE jobs SET status='rendering' WHERE id=? AND status='queued'",(row['id'],)).rowcount!=1:continue
            data = json.loads(row['data'])
            if data['version']!=VERSION:
                data['error']='Worker version changed; submit a new versioned plan';self.update(row['id'],'failed',data);continue
            data['stage'] = 'normalize'; self.update(row['id'], 'rendering', data)
            try:
                result = self.render(row['id'], data); self.update(row['id'], 'succeeded', result)
            except Exception as e:
                data['error'] = str(e)[:400]; self.update(row['id'], 'failed', data)
    def render(self, id, status):
        root = self.root / id; pack = json.loads((root / 'shot-package.json').read_text()); plan = pack['plan']['data']; assets = pack['approved_assets']; timeline = pack['timeline']; parts = []; cached = 0
        for index, shot in enumerate(timeline):
            asset = next(a for a in assets if a.get('shot_id') == shot['id'] and a['role'] == 'picture'); path = root / asset['delivery_file']; duration = positive(shot['duration']); start = source_in(asset.get('source_in', 0)); mime = asset.get('mime', '')
            if mime.startswith('video/'):
                meta = probe(path); actual = float(meta['format']['duration'])
                if start + duration > actual + .05: raise ValueError('Clip too short: ' + shot['id'])
                extra = ['-ss', str(start), '-i', str(path)]
            elif mime in ['image/png', 'image/jpeg', 'image/webp']: extra = ['-loop', '1', '-i', str(path)]
            else: raise ValueError('Unsupported shot MIME')
            transition=plan.get('composition',{}).get('transition','cut');motion=plan.get('composition',{}).get('still_motion','hold') if mime.startswith('image/') else 'hold';key = digest(json.dumps([VERSION, asset['sha256'], start, duration, 1080, 1920, 30,transition,motion]).encode()); part = self.root / 'cache' / (key + '.mp4')
            receipt=part.with_suffix('.json');cache_ok=False
            if part.exists() and receipt.exists():
                try:cache_ok=json.loads(receipt.read_text())['sha256']==digest(part.read_bytes())
                except (ValueError,KeyError):pass
            if cache_ok: cached += 1
            else:
                temp = self.root / 'cache' / (key + '.tmp.mp4')
                command(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', *extra, '-t', str(duration), '-an', '-vf', 'fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p'+(",zoompan=z='min(zoom+0.0004,1.06)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=30" if motion=='slow_zoom' else '')+(f',fade=t=in:st=0:d=0.15,fade=t=out:st={duration-.15}:d=0.15' if transition=='fade' else ''), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '2', str(temp)], root, 'shot-' + str(index + 1))
                temp.replace(part)
                receipt.write_text(json.dumps({'input_sha256':key,'sha256':digest(part.read_bytes())}))
            parts.append(part); status['stage'] = 'normalized-' + str(index + 1); self.update(id, 'rendering', status)
        (root / 'concat.txt').write_text('\n'.join("file '" + str(p) + "'" for p in parts) + '\n')
        command(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'picture.mp4'], root, 'concat')
        voice = next(a for a in assets if a['role'] == 'voice'); music = next(a for a in assets if a['role'] == 'music')
        for a in [voice, music]:
            if not a.get('mime', '').startswith('audio/') or source_in(a.get('source_in', 0)) >= float(probe(root / a['delivery_file'])['format']['duration']): raise ValueError('Audio source in exceeds duration')
        v = plan.get('voice_volume', 1); m = plan.get('music_volume', .15)
        if not isinstance(v, (float, int)) or not isinstance(m, (float, int)) or not 0 <= v <= 2 or not 0 <= m <= 1: raise ValueError('Volume invalid')
        filters = f"[1:a]atrim=start={voice.get('source_in',0)},asetpts=PTS-STARTPTS,volume={v},apad[v];[2:a]atrim=start={music.get('source_in',0)},asetpts=PTS-STARTPTS,volume={m},apad[m];[v][m]amix=inputs=2:normalize=0[a]"
        status['stage'] = 'mix-subtitles'; self.update(id, 'rendering', status)
        command(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', 'picture.mp4', '-i', voice['delivery_file'], '-i', music['delivery_file'], '-filter_complex', filters, '-map', '0:v', '-map', '[a]', '-vf', 'ass=captions.ass:fontsdir=fonts', '-t', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', 'output.mp4'], root, 'compose')
        meta = probe(root / 'output.mp4'); stream = next(s for s in meta['streams'] if s['codec_type'] == 'video'); seconds = float(meta['format']['duration'])
        if abs(seconds - 30) > .5 or stream['width'] != 1080 or stream['height'] != 1920 or stream['avg_frame_rate'] != '30/1' or not any(s['codec_type'] == 'audio' for s in meta['streams']): raise ValueError('Final media preflight failed')
        command(['ffmpeg', '-nostdin', '-hide_banner', '-i', 'output.mp4', '-vf', 'blackdetect=d=0.4:pic_th=0.98', '-an', '-f', 'null', '-'], root, 'blackdetect')
        black = [line for line in (root / 'blackdetect.log').read_text().splitlines() if 'black_start:' in line]
        frames = []
        for sec in [1, 15, 29]:
            name = 'frame-' + str(sec) + '.jpg'; command(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(sec), '-i', 'output.mp4', '-frames:v', '1', '-threads', '1', name], root, name); frames.append({'at': sec, 'sha256': digest((root / name).read_bytes())})
        command(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-ss','1','-i','output.mp4',*(['-vf','ass=cover.ass:fontsdir=fonts'] if plan.get('composition',{}).get('cover_text') else []),'-frames:v','1','-threads','1','cover.jpg'],root,'cover')
        cover={'filename':'cover.jpg','sha256':digest((root/'cover.jpg').read_bytes()),'size':(root/'cover.jpg').stat().st_size,'width':1080,'height':1920}
        result = {**status, 'cover':cover,'composition':plan.get('composition',{}),'stage': 'awaiting-human-review', 'output': {'filename': 'output.mp4', 'sha256': digest((root / 'output.mp4').read_bytes()), 'size': (root / 'output.mp4').stat().st_size, 'duration': seconds, 'width': 1080, 'height': 1920, 'fps': 30, 'video_codec': stream['codec_name'], 'audio_present': True}, 'qc': {'black_intervals': black, 'frames': frames, 'human_review': 'pending'}, 'normalized_shots': len(parts), 'reused_shots': cached, 'finished_at': stamp()}
        (root / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)); return result

def serve(renderer, token, host, port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def authorized(self):
            return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token)
        def respond(self, status, value):
            raw = json.dumps(value, ensure_ascii=False).encode(); self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(raw))); self.end_headers(); self.wfile.write(raw)
        def do_POST(self):
            if not self.authorized(): return self.respond(403, {'error': 'Unauthorized'})
            if self.path != '/jobs': return self.respond(404, {'error': 'Not found'})
            try:
                n = int(self.headers.get('Content-Length', '0'))
                if not 0 < n <= MAX_BYTES: raise ValueError('Package too large')
                raw = self.rfile.read(n)
                if len(raw) != n: raise ValueError('Incomplete upload')
                self.respond(202, renderer.submit(raw,self.headers.get('X-WOO-Request-ID')))
            except (ValueError, KeyError, zipfile.BadZipFile) as e: self.respond(400, {'error': str(e)[:300]})
        def do_GET(self):
            if not self.authorized(): return self.respond(403, {'error': 'Unauthorized'})
            u = urlparse(self.path);request_match=re.fullmatch(r'/requests/([a-f0-9-]{36})',u.path)
            if request_match:
                job=renderer.request_lookup(request_match[1],parse_qs(u.query).get('project_id',[''])[0]);return self.respond(200,job) if job else self.respond(404,{'error':'Request not found; do not automatically repost'})
            match = re.fullmatch(r'/jobs/(render-[a-f0-9]{64})(/file|/cover)?', u.path)
            if not match: return self.respond(404, {'error': 'Not found'})
            job = renderer.lookup(match[1], parse_qs(u.query).get('project_id', [''])[0])
            if not job: return self.respond(404, {'error': 'Not found'})
            if not match[2]: return self.respond(200, job)
            if job['status'] != 'succeeded': return self.respond(409, {'error': 'Not rendered'})
            is_cover=match[2]=='/cover';file = renderer.root / job['id'] / ('cover.jpg' if is_cover else 'output.mp4')
            if digest(file.read_bytes()) != job['data']['cover' if is_cover else 'output']['sha256']: return self.respond(409, {'error': 'Output hash mismatch'})
            self.send_response(200); self.send_header('Content-Type', 'image/jpeg' if is_cover else 'video/mp4'); self.send_header('Content-Length', str(file.stat().st_size)); self.send_header('Content-Disposition', 'attachment; filename="woo-cover-awaiting-review.jpg"' if is_cover else 'attachment; filename="woo-30s-awaiting-review.mp4"'); self.send_header('Cache-Control', 'no-store'); self.end_headers()
            with file.open('rb') as source: shutil.copyfileobj(source, self.wfile)
    return ThreadingHTTPServer((host, port), Handler)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--data-dir', type=Path, required=True); ap.add_argument('--host', default='127.0.0.1'); ap.add_argument('--port', type=int, default=8080); args = ap.parse_args(); token = os.environ.get('WOO_RENDERER_TOKEN', '')
    if len(token) < 32: raise SystemExit('WOO_RENDERER_TOKEN must be configured (32+ characters)')
    service = Renderer(args.data_dir); server = serve(service, token, args.host, args.port)
    try: server.serve_forever()
    finally: service.stop.set(); service.wake.set(); server.server_close()
