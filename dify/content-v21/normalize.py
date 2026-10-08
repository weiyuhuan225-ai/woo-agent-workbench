import json
import re

def page_matches(actual, expected):
    if not actual and not expected: return True
    if actual == expected: return True
    def bounds(value):
        match = re.fullmatch(r'P(\d+)(?:[–-]P?(\d+))?', value or '')
        return (int(match[1]), int(match[2] or match[1])) if match else None
    a, b = bounds(actual), bounds(expected)
    return bool(a and b and b[0] <= a[0] <= a[1] <= b[1])

FIELDS = {
    'poster': ['poster_spec', 'image_asset_ids', 'qc_report', 'print_checklist', 'revision_notes'],
    'script': ['script_meta', 'shots', 'shooting_list', 'edit_notes'],
    'graphic': ['pages', 'cover', 'caption', 'cta', 'publish_copy', 'qc_report'],
    'review': ['plan_vs_actual', 'evidence_map', 'budget_reconciliation', 'metric_definitions', 'conflicts', 'lessons', 'recommendations', 'final_report_outline'],
}

def main(request_json: str, model_text: str) -> dict:
    req, raw, errors = {}, {}, []
    try:
        req = json.loads(request_json)
        if not isinstance(req, dict):
            req = {}
            raise ValueError('输入必须为对象')
        key = req.get('agent_key')
        if key not in FIELDS: errors.append('未知专业能力')
        for name in ['run_id', 'project_context', 'source_set', 'task']:
            if not req.get(name): errors.append('缺少输入：' + name)
        if req.get('schema_version') != '2.1' or req.get('agent_version') != '2.1-text': errors.append('输入版本不匹配')
        text = model_text.strip()
        if text.startswith('```'): text = text.split('\n', 1)[1].rsplit('```', 1)[0]
        raw = json.loads(text)
        if not isinstance(raw, dict):
            raw = {}
            raise ValueError('模型输出必须为对象')
        for name in ['title', 'readable_text', 'next_action']:
            if not isinstance(raw.get(name), str) or not raw[name].strip(): errors.append('正文缺少：' + name)
        for name in ['assumptions', 'conflicts']:
            if not isinstance(raw.get(name), list) or any(not isinstance(x, str) for x in raw[name]): errors.append(name + '必须为字符串数组')
        structured = raw.get('structured_output')
        if not isinstance(structured, dict): raise ValueError('结构化产物必须为对象')
        for name in FIELDS.get(key, []):
            if structured.get(name) is None: errors.append('专业产物缺少：' + name)
        sources = req.get('source_set')
        if not isinstance(sources, list): raise ValueError('来源必须为数组')
        source_map = {s.get('id'): s for s in sources if isinstance(s, dict)}
        evidence = raw.get('evidence')
        if not isinstance(evidence, list) or not evidence: errors.append('缺少来源证据')
        else:
            for e in evidence:
                if not isinstance(e, dict): errors.append('证据必须为对象'); continue
                s = source_map.get(e.get('source_id'))
                quote = e.get('quote')
                if not s or not isinstance(s.get('text'), str) or not isinstance(quote, str) or not quote.strip() or quote not in s['text']: errors.append('引文无法逐字核对')
                elif not page_matches(e.get('page'), s.get('page')): errors.append('来源页码不匹配')
        if key == 'poster':
            spec = structured.get('poster_spec')
            if not isinstance(spec, dict): errors.append('海报规范必须为对象')
            else:
                for name in ['size', 'safe_area', 'grid', 'copy', 'visual_direction', 'prompt']:
                    if spec.get(name) is None: errors.append('海报规范缺少：' + name)
            if structured.get('image_asset_ids') != []: errors.append('文字分支不能声称已经生成图片')
        if key == 'script':
            shots, meta = structured.get('shots'), structured.get('script_meta')
            if not isinstance(shots, list) or len(shots) < 3 or not isinstance(meta, dict): errors.append('分镜或脚本信息不完整')
            else:
                durations = []
                for shot in shots:
                    if not isinstance(shot, dict): errors.append('分镜格式错误'); continue
                    for name in ['id', 'timecode', 'duration', 'type', 'visual', 'action', 'dialogue', 'audio', 'asset_ref', 'generation_prompt', 'status']:
                        if name not in shot: errors.append('分镜缺少：' + name)
                    duration = shot.get('duration')
                    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or duration <= 0: errors.append('镜头时长必须为正数秒')
                    else: durations.append(duration)
                    if shot.get('type') not in ['live', 'aigc']: errors.append('镜头类型错误')
                    if shot.get('type') == 'aigc' and not shot.get('generation_prompt'): errors.append('AIGC镜头缺少生成提示')
                target = meta.get('target_duration')
                if isinstance(target, bool) or not isinstance(target, (int, float)) or abs(sum(durations) - target) > 0.01: errors.append('镜头总时长与目标不符')
        if key == 'graphic':
            pages = structured.get('pages')
            if not isinstance(pages, list) or len(pages) < 3: errors.append('图文至少需要3页')
            else:
                for number, page in enumerate(pages, 1):
                    if not isinstance(page, dict): errors.append('页面格式错误'); continue
                    if page.get('page_no') != number: errors.append('页码不连续')
                    for name in ['role', 'headline', 'body', 'image_ref', 'caption', 'layout_template']:
                        if name not in page: errors.append('页面缺少：' + name)
    except Exception as exc:
        errors.append(str(exc))
    errors = list(dict.fromkeys(errors))
    key = req.get('agent_key') if req.get('agent_key') in FIELDS else 'review'
    result = {
        'schema_version': '2.1', 'run_id': str(req.get('run_id', 'invalid-input')),
        'agent_key': key, 'agent_version': '2.1-text', 'execution_mode': 'live',
        'review_status': 'needs_clarification' if errors else 'awaiting_review',
        'title': str(raw.get('title', '输入或产物需要修订')),
        'readable_text': str(raw.get('readable_text', '请补充输入并检查输出。')),
        'structured_output': raw.get('structured_output', {}) if isinstance(raw.get('structured_output'), dict) else {},
        'assumptions': raw.get('assumptions', []) if isinstance(raw.get('assumptions'), list) else [],
        'conflicts': raw.get('conflicts', []) if isinstance(raw.get('conflicts'), list) else [],
        'evidence': raw.get('evidence', []) if isinstance(raw.get('evidence'), list) else [],
        'next_action': str(raw.get('next_action', '修订后重试')),
        'source_set': req.get('source_set', []) if isinstance(req.get('source_set'), list) else [],
        'validation_errors': errors,
    }
    return {'result': result}
