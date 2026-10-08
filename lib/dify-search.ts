import {env} from 'cloudflare:workers';
import {HttpError} from './server';

export async function runDifySearch(request:{project_id:string;request_id:string;prompt:string;consent:true}, expectedModel:string){
 const key=(env as unknown as Record<string,string>).DIFY_WORKFLOW_API_KEY;
 if(!key)throw new HttpError(503,'Dify 总控尚未配置，联网搜索未提交。');
 const response=await fetch('https://api.dify.ai/v1/workflows/run',{
  method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({inputs:{brief:JSON.stringify({...request,kind:'search'}),requirements:'能力类型：media_search'},response_mode:'blocking',user:request.project_id}),
  signal:AbortSignal.timeout(95000),
 });
 if(!response.ok)throw new HttpError(502,`Dify 搜索调用失败（HTTP ${response.status}），请核对运行日志；不会自动切换供应商重复提交。`);
 const payload:any=await response.json();
 if(payload.data?.status!=='succeeded')throw new HttpError(502,'Dify 搜索工作流未成功完成，请核对运行日志。');
 const items=payload.data.outputs?.media_result;
 if(!Array.isArray(items)||items.length!==1)throw new HttpError(502,'Dify 搜索返回格式不匹配，未写入调研结果。');
 const result=items[0];
 if(result?.status!=='completed'||result?.model!==expectedModel||typeof result.id!=='string'||!Array.isArray(result.output))throw new HttpError(502,'方舟搜索结果未完整返回或模型不匹配，未写入调研结果。');
 return {result,workflow_run_id:String(payload.workflow_run_id||payload.data.id||''),elapsed:payload.data.elapsed_time??null};
}
