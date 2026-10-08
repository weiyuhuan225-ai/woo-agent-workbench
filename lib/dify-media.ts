import {env} from 'cloudflare:workers';
import {HttpError} from './server';

/** Queries a stored task only; this function never creates a paid generation. */
export async function queryDifyVideo(request:{project_id:string;task_id:string},expectedModel:string,workflowId?:string){
 if(!/^cgt-[A-Za-z0-9_-]{1,100}$/.test(request.task_id))throw new HttpError(400,'无效的视频任务编号。');
 const key=(env as unknown as Record<string,string>).DIFY_WORKFLOW_API_KEY;
 if(!key)throw new HttpError(503,'Dify 总控尚未配置，视频查询未提交。');
 const response=await safeDifyFetch(workflowId?'https://api.dify.ai/v1/workflows/'+workflowId+'/run':'https://api.dify.ai/v1/workflows/run',{
  method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({inputs:{brief:JSON.stringify({...request,kind:'video_status'}),requirements:'能力类型：media_video_status'},response_mode:'blocking',user:request.project_id}),
  signal:AbortSignal.timeout(45000),
 });
 if(!response.ok)throw new HttpError(502,`Dify 视频查询失败（HTTP ${response.status}），可稍后查询原任务，不要重新生成。`);
 const payload:any=await response.json();
 if(payload.data?.status!=='succeeded')throw new HttpError(502,'Dify 视频查询工作流未成功，可稍后查询原任务。');
 const items=payload.data.outputs?.video_status_result;
 if(!Array.isArray(items)||items.length!==1)throw new HttpError(502,'Dify 视频查询返回格式不匹配。');
 const result=items[0];
 if(result?.id!==request.task_id||result?.model!==expectedModel||!['queued','running','succeeded','failed','cancelled','expired'].includes(result.status))throw new HttpError(502,'查询结果的任务编号、模型或状态不匹配，未更新原任务。');
 return {result,workflow_run_id:String(payload.workflow_run_id||payload.data.id||''),elapsed:payload.data.elapsed_time??null};
}

/** Submits a reviewed design specification; archival retries must not call this again. */
export async function generateDifyImage(request:{project_id:string;request_id:string;prompt:string;approved_run_id:string;reference_image?:string;consent:true},expectedModel:string){
 const key=(env as unknown as Record<string,string>).DIFY_WORKFLOW_API_KEY;
 if(!key)throw new HttpError(503,'Dify 总控尚未配置，图片未提交。');
 const response=await safeDifyFetch('https://api.dify.ai/v1/workflows/run',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({inputs:{brief:JSON.stringify({...request,kind:'image'}),requirements:request.reference_image?'能力类型：media_reference_image':'能力类型：media_image'},response_mode:'blocking',user:request.project_id}),signal:AbortSignal.timeout(request.reference_image?240000:110000)});
 if(!response.ok)throw new HttpError(502,`Dify 图片调用失败（HTTP ${response.status}），请先核对日志，不要重复生成。`);
 const payload:any=await response.json();
 if(payload.data?.status!=='succeeded')throw new HttpError(502,'Dify 图片工作流未成功完成，请先核对日志。');
 const items=payload.data.outputs?.[request.reference_image?'image_reference_result':'image_result'];
 if(!Array.isArray(items)||items.length!==1)throw new HttpError(502,'Dify 图片输出格式不匹配。');
 const result=items[0];
 if(result?.model!==expectedModel||!Array.isArray(result.data)||result.data.length!==1||typeof result.data[0]?.url!=='string'||result.data[0]?.error)throw new HttpError(502,'Dify 未返回所选模型的一张有效图片。');
 return {result,workflow_run_id:String(payload.workflow_run_id||payload.data.id||''),elapsed:payload.data.elapsed_time??null};
}

async function safeDifyFetch(url:string,options:RequestInit){
 try{return await fetch(url,options)}catch{throw new HttpError(504,'Dify 请求结果未确认，请核对原运行记录，不要重复生成。')}
}

export async function submitDifyVideo(request:{project_id:string;request_id:string;prompt:string;approved_run_id:string;reference_image?:string;ratio:string;consent:true}){
 const key=(env as unknown as Record<string,string>).DIFY_WORKFLOW_API_KEY;
 if(!key)throw new HttpError(503,'Dify 总控尚未配置，视频未提交。');
 const response=await safeDifyFetch('https://api.dify.ai/v1/workflows/run',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({inputs:{brief:JSON.stringify({...request,kind:'video'}),requirements:'能力类型：media_video_submit'},response_mode:'blocking',user:request.project_id}),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new HttpError(502,`Dify 视频提交失败（HTTP ${response.status}），请核对日志，不要重复生成。`);
 const payload:any=await response.json();
 if(payload.data?.status!=='succeeded')throw new HttpError(502,'Dify 视频提交工作流未成功，请核对日志。');
 const items=payload.data.outputs?.video_submit_result;
 if(!Array.isArray(items)||items.length!==1||typeof items[0]?.id!=='string'||!/^cgt-[A-Za-z0-9_-]{1,100}$/.test(items[0].id))throw new HttpError(502,'Dify 未返回有效视频任务编号，请核对日志，勿重复生成。');
 return {result:items[0],workflow_run_id:String(payload.workflow_run_id||payload.data.id||''),elapsed:payload.data.elapsed_time??null};
}
