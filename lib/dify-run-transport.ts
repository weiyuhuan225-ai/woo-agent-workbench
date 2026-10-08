/** Dify transport only. Durable scheduling is a separate deployment requirement. */
export type DifyRun = {
 id:string; status:'running'|'succeeded'|'failed'|'stopped'|'partial-succeeded'|'paused';
 outputs:Record<string,unknown>; inputs?:unknown; workflow_id?:string;
 total_tokens?:number|null; elapsed_time?:number|null;
};
export type DifyRunIdentity={workflow_run_id:string;task_id?:string;workflow_id?:string};
export class DifyRunError extends Error {
 constructor(message:string,public certainty:'unknown'|'confirmed_failure'='unknown',public workflow_run_id?:string){super(message);this.name='DifyRunError'}
}
const base='https://api.dify.ai/v1';
const runId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const limit=4*1024*1024;
export function parseDifyRun(raw:unknown,expectedId:string):DifyRun {
 const r=raw as DifyRun;
 if(!r||r.id!==expectedId||!runId.test(r.id)||!['running','succeeded','failed','stopped','partial-succeeded','paused'].includes(r.status))throw new DifyRunError('原运行的状态或编号不匹配，未覆盖本地记录。');
 if(r.outputs!=null&&(typeof r.outputs!=='object'||Array.isArray(r.outputs)))throw new DifyRunError('原运行输出格式不匹配，保留原记录待核对。');
 return {id:r.id,status:r.status,outputs:r.outputs||{},inputs:r.inputs,workflow_id:r.workflow_id,total_tokens:r.total_tokens??null,elapsed_time:r.elapsed_time??null};
}
async function boundedJson(response:Response){
 if(!response.body)throw new DifyRunError('Dify 返回为空，结果待核对。');
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new DifyRunError('Dify 返回超过安全大小，保留原运行待核对。');text+=decoder.decode(value,{stream:true})}text+=decoder.decode();return JSON.parse(text)}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
/** GET only: retries of this function never start a generation or stop a run. */
export async function getDifyRun(secret:string,id:string):Promise<DifyRun>{
 if(!secret||!runId.test(id))throw new DifyRunError('缺少有效的 Dify 配置或已保存的运行编号。');
 try{
  const response=await fetch(`${base}/workflows/run/${id}`,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(20000),redirect:'manual'});
  if(!response.ok)throw new DifyRunError(`暂时无法查询原运行（HTTP ${response.status}）；不会重新生成。`,'unknown',id);
  return parseDifyRun(await boundedJson(response),id);
 }catch(e){if(e instanceof DifyRunError)throw e;
  const kind=e instanceof SyntaxError?'invalid_json':e instanceof Error?e.name:'unknown';
  console.warn('dify_run_query_failed',{kind});
  throw new DifyRunError(kind==='invalid_json'?'Dify 原运行查询未返回有效 JSON；请核对接口状态，不需要重新生成。':'查询原运行连接失败；请稍后再查询，不需要重新生成。','unknown',id)}
}
/** Persist the first observed run ID BEFORE consuming more events. Never auto-replay POST. */
export async function streamDifyRun(secret:string,inputs:Record<string,string>,user:string,onRun:(identity:DifyRunIdentity)=>Promise<void>,workflowId?:string):Promise<DifyRun>{
 if(!secret)throw new DifyRunError('Dify 尚未配置。');
 if(workflowId&&!runId.test(workflowId))throw new DifyRunError('锁定的Dify发布版本编号无效，未提交。','confirmed_failure');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),95000);
 let known:string|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const response=await fetch(`${base}/workflows/${workflowId?workflowId+'/':''}run`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({inputs,response_mode:'streaming',user}),signal:controller.signal,redirect:'manual'});
  if(!response.ok)throw new DifyRunError(`Dify 提交返回 HTTP ${response.status}；请核对原记录，不自动重发。`);
  if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw new DifyRunError('Dify 未返回预期事件流，提交结果待核对。');
  reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',bytes=0;
  async function event(frame:string):Promise<DifyRun|undefined>{
   const data=frame.split('\n').filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');
   if(!data||data==='[DONE]')return;
   const e=JSON.parse(data);const id=e.workflow_run_id||(['workflow_started','workflow_finished'].includes(e.event)?e.data?.id:undefined);
   if(id){
    if(typeof id!=='string'||!runId.test(id)||(known&&known!==id))throw new DifyRunError('事件流运行编号冲突，已停止接收并保留原记录。','unknown',known);
    if(!known){known=id;await onRun({workflow_run_id:id,...(typeof e.task_id==='string'?{task_id:e.task_id}:{}),...(typeof e.data?.workflow_id==='string'?{workflow_id:e.data.workflow_id}:{})})}
   }
   if(workflowId&&e.data?.workflow_id&&e.data.workflow_id!==workflowId)throw new DifyRunError('Dify返回的发布版本与本批锁定版本不匹配，保留原运行待核对。','unknown',known);
   if(e.event==='workflow_finished'){
    if(!known)throw new DifyRunError('结束事件缺少运行编号。');
    return parseDifyRun(e.data,known);
   }
   if(e.event==='error')throw new DifyRunError('Dify 事件流报告异常，先查询原运行。','unknown',known);
  }
  while(true){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;if(bytes>limit)throw new DifyRunError('Dify 事件流超过安全大小，请查询原运行。','unknown',known);
   buffer+=decoder.decode(value,{stream:true});
   // CRLF can be split across chunks; normalize only after appending.
   buffer=buffer.replace(/\r\n/g,'\n');let end:number;
   while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const result=await event(frame);if(result)return result}
  }
  buffer+=decoder.decode();if(buffer.trim()){const result=await event(buffer);if(result)return result}
  throw new DifyRunError('事件流已断开，结果待核对；可查询已保存的原运行。','unknown',known);
 }catch(e){if(e instanceof DifyRunError)throw e;throw new DifyRunError('Dify 连接或运行号保存中断；结果待核对，不自动重发。','unknown',known)}
 finally{clearTimeout(timer);controller.abort();if(reader){await reader.cancel().catch(()=>{});reader.releaseLock()}}
}
