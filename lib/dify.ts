import {env} from 'cloudflare:workers';
import {resultSchema} from './agent-contract';
import {verifyExplicitSums} from './arithmetic';
import {decodeProfessionalOutput} from './dify-v21';
import type {V2Request} from './v2-contract';
import {streamDifyRun,getDifyRun,DifyRunError,type DifyRun,type DifyRunIdentity} from './dify-run-transport';
export function configured(){return !!(env as unknown as Record<string,string>).DIFY_WORKFLOW_API_KEY}
export async function runDify(key:string,brief:string,requirements:string,user:string,professionalRequest?:V2Request,onRun?:(identity:DifyRunIdentity)=>Promise<void>){
 const secret=(env as unknown as Record<string,string>).DIFY_WORKFLOW_API_KEY;
 if(onRun){
  const run=await streamDifyRun(secret,{brief,requirements},user,onRun);
  return decodeDifyResult(key,run,professionalRequest);
 }
 let response:Response;
 try{response=await fetch('https://api.dify.ai/v1/workflows/run',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({inputs:{brief,requirements},response_mode:'blocking',user}),signal:AbortSignal.timeout(95000)})}catch{throw new Error('暂时无法连接 Dify，调用结果未确认。请核对 Dify 原运行记录后再操作，避免重复提交。')}
 if(!response.ok){
  // Translate known provider errors without reflecting upstream text or credentials.
  const problem:any=await response.json().catch(()=>({}));
  if(typeof problem.code==='string'&&/quota|credit/.test(problem.code))throw new Error('Dify 调用额度不足或已用尽。请核对模型消息额度和工作区执行额度；可补充 Dify 模型额度，或接入有余额的模型 API。更换工作台密钥不会恢复额度。');
  if(problem.code==='provider_not_initialize')throw new Error('Dify 尚未配置可用的模型供应商，请先在 Dify 集成中完成配置。');
  if(problem.code==='rate_limit_error')throw new Error('Dify 工作流执行额度或速率受限，请检查 Dify 工作区套餐与额度。');
  throw new Error(response.status===401||response.status===403?'Dify 授权无效，请检查服务端密钥。':response.status===429?'Dify 请求频率或并发数受限，请稍后重试。':`Dify 暂时无法完成请求（HTTP ${response.status}）。请核对 Dify 模型额度、供应商配置和运行日志，确认原因后再重试。`);
 }
 const payload:any=await response.json();
 return decodeDifyResult(key,{...payload.data,id:String(payload.workflow_run_id||payload.data?.id||'')},professionalRequest);
}
export async function queryStoredDifyRun(id:string){return getDifyRun((env as unknown as Record<string,string>).DIFY_WORKFLOW_API_KEY,id)}
export function decodeDifyResult(key:string,run:DifyRun,professionalRequest?:V2Request){
 if(run.status!=='succeeded')throw new DifyRunError('Dify 原工作流未成功完成，请核对运行记录。',['failed','stopped'].includes(run.status)?'confirmed_failure':'unknown',run.id);
 const payload={data:run,workflow_run_id:run.id};
 if(professionalRequest&&(payload.data.outputs?.[key+'_result']||payload.data.outputs?.content_result))return {...decodeProfessionalOutput(payload.data.outputs,professionalRequest),workflow_run_id:String(payload.workflow_run_id||payload.data.id||''),tokens:payload.data.total_tokens??null,elapsed:payload.data.elapsed_time??null};
 let raw=payload.data.outputs?.result;if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch{throw new Error('结果不是有效 JSON，请检查工作流版本。')}}
 const result=resultSchema.safeParse(raw);if(!result.success||result.data.agent_key!==key)throw new Error('结果格式或能力类型不匹配，未写入内容库。请使用七类能力 v0.2 工作流。');
 for(const section of [result.data.body,...result.data.evidence])verifyExplicitSums(section);
 return {result:result.data,workflow_run_id:String(payload.workflow_run_id||payload.data.id||''),tokens:payload.data.total_tokens??null,elapsed:payload.data.elapsed_time??null};
}
