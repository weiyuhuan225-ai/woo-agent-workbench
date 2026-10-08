import json
def main(request_json: str) -> dict:
    req = {}
    try:
        req = json.loads(request_json)
        if not isinstance(req, dict):
            req = {}
            raise ValueError('request_json 必须是对象')
        required = ['run_id', 'agent_key', 'project_context', 'source_set', 'task']
        missing = [x for x in required if not req.get(x)]
        if missing: raise ValueError('缺少必填字段：' + ', '.join(missing))
        if req['agent_key'] != 'strategy': raise ValueError('agent_key 与流程不匹配')
        sources = req['source_set']
        if not isinstance(sources, list): raise ValueError('source_set 必须是数组')
        for s in sources:
            if not all(k in s for k in ['id','version','date','type','confidence']):
                raise ValueError('来源缺少版本/日期/类型/可信度字段')
        result = {'schema_version':'2.1', 'run_id':req['run_id'], 'agent_key':'strategy', 'agent_version':'2.0-m1', 'execution_mode':'mock', 'review_status':'awaiting_review', 'title':'契约验证通过（模拟）', 'readable_text':'已验证输入与来源字段。尚未执行模型、检索或媒体工具。此结果不可作为业务产物验收。', 'structured_output':{}, 'assumptions':[], 'conflicts':[], 'evidence':[], 'next_action':'接入专业节点和真实工具后执行 M4 测试', 'source_set':sources, 'validation_errors':[]}
    except Exception as e:
        result = {'schema_version':'2.1','run_id':req.get('run_id','invalid-input'),'source_set':[], 'agent_key':'strategy','agent_version':'2.0-m1','execution_mode':'mock','review_status':'needs_clarification','title':'输入验证失败','readable_text':str(e),'structured_output':{},'assumptions':[],'conflicts':[],'evidence':[],'next_action':'修复输入后重试','validation_errors':[str(e)]}
    return {'result':result}
