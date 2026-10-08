import json

def main(request_json: str, model_text: str) -> dict:
    req = {}
    errors = []
    raw = {}
    try:
        req = json.loads(request_json)
        if not isinstance(req, dict):
            req = {}
            raise ValueError('输入必须为 JSON 对象')
        for name in ['run_id','project_context','source_set','task']:
            if not req.get(name): errors.append('缺少字段：'+name)
        if req.get('agent_key') != 'topic': errors.append('能力类型与流程不匹配')
        text = model_text.strip()
        if text.startswith('```'):
            text = text.split('\n',1)[1].rsplit('```',1)[0]
        raw = json.loads(text)
        if not isinstance(raw, dict): raise ValueError('模型输出必须为对象')
        for k in ['title','readable_text','structured_output','assumptions','conflicts','evidence','next_action']:
            if k not in raw: errors.append('模型输出缺少：'+k)
        if not isinstance(raw.get('structured_output'),dict): errors.append('结构化产物不是对象')
        sources = req.get('source_set',[])
        if not isinstance(sources,list): sources=[];errors.append('source_set 必须为数组')
        ids = {s.get('id') for s in sources if isinstance(s,dict)}
        for e in raw.get('evidence',[]):
            if not isinstance(e,dict) or e.get('source_id') not in ids: errors.append('证据引用了未知来源')
        for fact in raw.get('structured_output',{}).get('facts',[]):
            if not isinstance(fact,dict) or fact.get('source_id') not in ids: errors.append('事实引用了未知来源')
        for k in ['assumptions','conflicts']:
            if not isinstance(raw.get(k),list) or any(not isinstance(x,str) for x in raw.get(k,[])): errors.append(k+'必须为字符串数组')
    except Exception as e:
        errors.append(str(e))
    errors=list(dict.fromkeys(errors))
    result={'schema_version':'2.1','run_id':str(req.get('run_id','invalid-input')),'agent_key':'topic','agent_version':'2.1-text','execution_mode':'live','review_status':'needs_clarification' if errors else 'awaiting_review','title':str(raw.get('title','输入或输出需要修订')),'readable_text':str(raw.get('readable_text','请补充输入并检查模型输出。')),'structured_output':raw.get('structured_output',{}) if isinstance(raw.get('structured_output'),dict) else {},'assumptions':raw.get('assumptions',[]) if isinstance(raw.get('assumptions'),list) else [],'conflicts':raw.get('conflicts',[]) if isinstance(raw.get('conflicts'),list) else [],'evidence':raw.get('evidence',[]) if isinstance(raw.get('evidence'),list) and not any('来源' in x for x in errors) else [],'next_action':str(raw.get('next_action','修复输入/来源后重试')),'source_set':req.get('source_set',[]) if isinstance(req.get('source_set'),list) else [],'validation_errors':errors}
    return {'result':result}
