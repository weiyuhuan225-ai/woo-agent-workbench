import {outputSchema,requestSchema,type V2Request} from './v2-contract';
import type {AgentResult} from './agent-contract';
import {knowledgeSources} from './knowledge-sources';
export const independentKeys = ['research','strategy','topic','poster','script','graphic','review'];
function pageMatches(actual:string|undefined,expected:string|undefined){
 if(!actual&&!expected)return true;if(actual===expected)return true;
 const parse=(v:string|undefined)=>{const m=v?.match(/^P(\d+)(?:[–-]P?(\d+))?$/);return m?[+m[1],+(m[2]||m[1])]:null;};
 const a=parse(actual),e=parse(expected);return !!(a&&e&&a[0]<=a[1]&&a[0]>=e[0]&&a[1]<=e[1]);
}
export function decodeProfessionalOutput(outputs:Record<string,unknown>,request:V2Request){
 request=requestSchema.parse(request);
 const wire=outputs[request.agent_key+'_result'] ?? (['poster','script','graphic','review'].includes(request.agent_key)?outputs.content_result:undefined);
 if(!Array.isArray(wire)||wire.length!==1)throw new Error('专业流程返回格式不匹配，未保存为可审核产物。');
 const parsed=outputSchema.safeParse((wire[0] as any)?.result);
 if(!parsed.success)throw new Error('专业流程缺少必需字段，未保存为可审核产物。');
 const x=parsed.data;
 if(x.run_id!==request.run_id||x.agent_key!==request.agent_key||x.agent_version!==request.agent_version||x.execution_mode!=='live')throw new Error('专业流程的任务标识或版本不匹配。');
 if(JSON.stringify(x.source_set)!==JSON.stringify(request.source_set))throw new Error('专业流程返回的来源版本与本次请求不一致。');
 const errors=[...x.validation_errors],sources=new Map(request.source_set.map(s=>[s.id,s]));
 for(const e of x.evidence){const s=sources.get(e.source_id);if(!s?.text||!e.quote.trim()||!s.text.includes(e.quote)||!pageMatches(e.page,s.page))errors.push('证据摘录或页码无法与输入来源逐字核对。');}
 if(x.review_status==='awaiting_review'){
  if(!x.readable_text.trim()||!x.evidence.length)errors.push('正文或来源证据为空。');
  const required:Record<string,string[]>={research:['questions','facts','inferences','source_comparison','research_gaps','conflict_register'],strategy:['objectives','audience','options','activities','budget_check','risks','schedule','acceptance'],topic:['strategy_link','topics','dedup_check','schedule','production_dependencies','channel_checks'],poster:['poster_spec','image_asset_ids','qc_report','print_checklist','revision_notes'],script:['script_meta','shots','shooting_list','edit_notes'],graphic:['pages','cover','caption','cta','publish_copy','qc_report'],review:['plan_vs_actual','evidence_map','budget_reconciliation','metric_definitions','conflicts','lessons','recommendations','final_report_outline']};
  for(const k of required[x.agent_key]||[])if(x.structured_output[k]===undefined||x.structured_output[k]===null)errors.push('专业结果缺少字段：'+k);
  if(x.agent_key==='poster'){
   const spec=x.structured_output.poster_spec as Record<string,unknown>;
   if(!spec||typeof spec!=='object'||Array.isArray(spec))errors.push('海报规范必须为对象。');
   else for(const k of ['size','safe_area','grid','copy','visual_direction','prompt'])if(spec[k]==null)errors.push('海报规范缺少字段：'+k);
   if(!Array.isArray(x.structured_output.image_asset_ids)||x.structured_output.image_asset_ids.length)errors.push('文字分支不能声称已经生成图片。');
  }
  if(x.agent_key==='script'){
   const shots=x.structured_output.shots,meta=x.structured_output.script_meta as Record<string,unknown>;
   if(!Array.isArray(shots)||shots.length<3||!meta||typeof meta!=='object')errors.push('分镜或脚本信息不完整。');
   else{
    let duration=0;
    for(const shot of shots){
     for(const k of ['id','timecode','duration','type','visual','action','dialogue','audio','asset_ref','generation_prompt','status'])if(shot?.[k]===undefined)errors.push('分镜缺少字段：'+k);
     if(typeof shot?.duration!=='number'||!Number.isFinite(shot.duration)||shot.duration<=0)errors.push('镜头时长必须为正数秒。');else duration+=shot.duration;
     if(!['live','aigc'].includes(shot?.type))errors.push('镜头类型错误。');
     if(shot?.type==='aigc'&&!shot.generation_prompt)errors.push('AIGC镜头缺少生成提示。');
    }
    if(typeof meta.target_duration!=='number'||!Number.isFinite(meta.target_duration)||Math.abs(duration-meta.target_duration)>0.01)errors.push('镜头总时长与目标不符。');
   }
  }
  if(x.agent_key==='graphic'){
   const pages=x.structured_output.pages;
   if(!Array.isArray(pages)||pages.length<3)errors.push('图文至少需要3页。');
   else pages.forEach((page,i)=>{if(page?.page_no!==i+1)errors.push('图文页码不连续。');for(const k of ['role','headline','body','image_ref','caption','layout_template'])if(page?.[k]===undefined)errors.push('图文页面缺少字段：'+k);});
  }
  if(x.agent_key==='strategy'&&(!Array.isArray(x.structured_output.options)||x.structured_output.options.length<2))errors.push('策略需要至少两种机制对比。');
  if(x.agent_key==='topic'){
   const topics=x.structured_output.topics;
   if(!Array.isArray(topics)||topics.length!==3)errors.push('选题结果需要三项候选。');
   else for(const t of topics){for(const k of ['topic_id','title','channel','audience','brand_reason','outline','CTA','assets','live_or_aigc','evidence_ids','score','reason'])if(t?.[k]===undefined)errors.push('选题缺少字段：'+k);if(!Array.isArray(t?.evidence_ids)||t.evidence_ids.some((id:unknown)=>typeof id!=='string'||!sources.has(id)))errors.push('选题依据引用了未知来源。');}
  }
  if(x.agent_key==='research'){const facts=x.structured_output.facts;if(!Array.isArray(facts))errors.push('事实列表类型不正确。');else for(const f of facts)if(!sources.has(f?.source_id)||typeof f?.claim!=='string')errors.push('事实依据引用了未知来源。');}
 }
 if(errors.length){x.validation_errors=[...new Set(errors)];x.review_status='needs_clarification';}
 const result:AgentResult={schema_version:'2.0',agent_key:x.agent_key,status:x.review_status,title:x.title,body:x.readable_text,evidence:x.evidence.map(e=>`${e.source_id}${e.page?' · '+e.page:''}：${e.quote}`),warnings:[...x.conflicts,...x.assumptions].slice(0,30),to_confirm:[x.next_action,...x.validation_errors].filter(Boolean).slice(0,30),review_notes:['专业能力流程 '+x.agent_version+'；原始结构化结果与来源版本已保留。']};
 return {result,v2_output:x};
}
export function buildProfessionalRequest(key:string,runId:string,project:any,snapshot:any,reference:string,closeout:string,upstream:any[],instruction:string){
 return requestSchema.parse({schema_version:'2.1',run_id:runId,agent_key:key,agent_version:'2.1-text',project_context:{project_id:project.id,revision:project.revision,name:project.name,brief:project.brief||''},source_set:[...snapshot.source_set.map((s:any)=>({...s,text:s.id==='woo-final-closeout'?closeout+'\n'+knowledgeSources[0].text:s.id==='project:'+project.id?['项目名称：'+project.name,'品牌：'+project.brand,'学校：'+project.school,'目标：'+project.goal,'简报：'+project.brief,'来源说明：'+project.source_note,'任务与预算版本快照：',JSON.stringify(snapshot)].join('\n'):JSON.stringify(upstream.find(u=>u.run_id===s.id)?.result||{})})),...(closeout&&project.id==='woo-original'?knowledgeSources.slice(1):[]),...(reference?[{id:'reference:'+runId,version:runId,date:null,type:'project',confidence:'unverified',text:reference}]:[])],project_data:snapshot,task:{instruction,upstream_run_ids:upstream.map(u=>u.run_id)}});
}
