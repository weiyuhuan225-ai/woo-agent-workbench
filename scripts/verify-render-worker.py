#!/usr/bin/env python3
"""Local HTTP/FFmpeg technical fixture; all clips/audio are synthetic, no AI calls."""
import uuid, hashlib, importlib.util, io, json, secrets, subprocess, threading, time, urllib.request, urllib.error, zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('render_worker', 'services/render-worker/server.py'); mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
root=Path('.sites-runtime/render-verification').resolve(); root.mkdir(parents=True,exist_ok=True)
for name,args in [('clip.mp4',['-f','lavfi','-i','testsrc2=size=320x180:rate=30','-t','15','-c:v','libx264','-preset','ultrafast','-threads','1']),('voice.wav',['-f','lavfi','-i','sine=frequency=440:duration=30','-c:a','pcm_s16le']),('music.wav',['-f','lavfi','-i','sine=frequency=180:duration=30','-c:a','pcm_s16le']),('still.png',['-f','lavfi','-i','color=c=yellow:s=320x180','-frames:v','1','-threads','1']),('replacement.png',['-f','lavfi','-i','color=c=orange:s=320x180','-frames:v','1','-threads','1'])]:
    if not (root/name).exists():subprocess.run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',*args,str(root/name)],check=True)
def package(replace=False):
    shots=[];assets=[];payload={}
    for i in range(6):
        name='clip.mp4' if i<3 else ('replacement.png' if replace and i==5 else 'still.png');data=(root/name).read_bytes();file='media/shot-'+str(i)+('.mp4' if i<3 else '.png');sha=mod.digest(data)
        shots.append({'id':'S'+str(i+1),'type':'live' if i<3 else 'aigc','duration':5,'asset_ref':'synthetic-'+str(i),'source_in':i*5 if i<3 else 0})
        assets.append({'role':'picture','shot_id':'S'+str(i+1),'asset_id':'synthetic-'+str(i),'revision':1,'mime':'video/mp4' if i<3 else 'image/png','sha256':sha,'delivery_file':file,'source_in':i*5 if i<3 else 0,'rights_note':'Technical test fixture, not real live/AIGC evidence'})
        payload[file]=data
    for role in ['voice','music']:
        data=(root/(role+'.wav')).read_bytes();file='media/'+role+'.wav';assets.append({'role':role,'asset_id':'synthetic-'+role,'revision':1,'mime':'audio/wav','sha256':mod.digest(data),'delivery_file':file,'source_in':0,'rights_note':'Generated synthetic tone, not speech or real soundtrack'});payload[file]=data
    srt='1\n00:00:00,000 --> 00:00:04,000\n合成测试 · 非活动成片\n\n2\n00:00:15,000 --> 00:00:19,000\n中文字体与字幕验证\n'
    manifest={'synthetic':True,'project_id':'synthetic-render','script':{'id':'fixture-script','sha256':mod.digest(b'synthetic-six-shots')},'plan':{'revision':2 if replace else 1,'data':{'consent':True,'srt':srt,'subtitle_source':'Synthetic technical fixture','voice_volume':.5,'music_volume':.15,'composition':{'transition':'fade','still_motion':'slow_zoom','cover_text':'合成封面 · 非活动成片','endcard_text':'合成片尾\n技术验收，非活动成片','endcard_seconds':3}}},'timeline':shots,'approved_assets':assets}
    payload['shot-package.json']=json.dumps(manifest,ensure_ascii=False).encode();payload['captions.srt']=srt.encode();payload['READ-BEFORE-RENDER.txt']='合成测试包，仅技术验收'.encode()
    for name in ['WOO-CJKsc-Regular.otf','OFL-NotoSansCJK.txt']:payload['fonts/'+name]=(Path('public/fonts')/name).read_bytes()
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_STORED) as z:
        for name,data in payload.items():z.writestr(name,data)
    return buf.getvalue()
renderer=mod.Renderer(root/'worker-data'); token=secrets.token_hex(32);server=mod.serve(renderer,token,'127.0.0.1',0);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base='http://127.0.0.1:'+str(server.server_port)
def http(path,data=None,auth=True,request_id=None):
    return urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=({'Authorization':'Bearer '+token,**({'X-WOO-Request-ID':request_id} if request_id else {})} if auth else {})),timeout=60)
def wait(id):
    start=time.monotonic();last=''
    while time.monotonic()-start<300:
        data=json.load(http('/jobs/'+id+'?project_id=synthetic-render'));stage=data['data']['stage']
        if stage!=last:print('Render stage',stage,flush=True);last=stage
        if data['status']=='failed':raise AssertionError(data)
        if data['status']=='succeeded':return data
        time.sleep(1)
    raise AssertionError('Render timeout')
try:
    raw=package();request_id=str(uuid.uuid4());first=json.load(http('/jobs',raw,request_id=request_id));id=first['id'];assert json.load(http('/requests/'+request_id+'?project_id=synthetic-render'))['id']==id;assert json.load(http('/jobs',raw))['id']==id
    try:http('/jobs/'+id+'?project_id=synthetic-render',auth=False);raise AssertionError('Unauthorized access')
    except urllib.error.HTTPError as e:assert e.code==403
    try:http('/jobs/'+id+'?project_id=another-project');raise AssertionError('Cross project access')
    except urllib.error.HTTPError as e:assert e.code==404
    done=wait(id);cover=http('/jobs/'+id+'/cover?project_id=synthetic-render').read();assert mod.digest(cover)==done['data']['cover']['sha256'];assert done['data']['composition']['transition']=='fade';(root/'synthetic-cover-awaiting-review.jpg').write_bytes(cover);output=http('/jobs/'+id+'/file?project_id=synthetic-render').read();assert mod.digest(output)==done['data']['output']['sha256'];(root/'synthetic-30s-awaiting-review.mp4').write_bytes(output)
    assert done['data']['output']['duration']==30 and done['data']['output']['width']==1080 and done['data']['output']['height']==1920
    replaced=json.load(http('/jobs',package(True)));changed=wait(replaced['id']);assert changed['data']['reused_shots']==5
    evidence={'synthetic':True,'real_model_calls':0,'production_resource_connected':False,'worker_version':mod.VERSION,'ffmpeg_version':subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0],'submit_query_download':True,'request_id_lookup':True,'fade_transitions_and_endcard':True,'still_slow_zoom':True,'cover_sha_download':True,'idempotent_submit':True,'auth_and_project_isolation':True,'first':done,'replace_one_shot':changed,'expected_reused_shots':5,'human_review':'pending','notice':'This is a technical test with test-pattern clips, color stills and synthetic tones. It is not an approved campus activity film. Local service is stopped after the check; live Site has no persistent renderer.'}
    Path('docs/v3/evidence/render-worker-local-synthetic.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    print('PASS: real HTTP task IDs, actual 30s 1080x1920 H264/AAC MP4, pinned CJK subtitles, SHA download, idempotence, project isolation and five cached shots after one replacement. No AI calls.',flush=True)
finally:
    server.shutdown();server.server_close();renderer.stop.set();renderer.wake.set()
