import {database,record,now,HttpError} from './server';
import {copyInput,completeCopy,decodeCopy} from './copywriting';
import {decodeDifyResult,queryStoredDifyRun} from './dify';
import {requestSchema} from './v2-contract';

/** CAS merge protects recovered output and human edits from a late original request. */
export async function updateCopyRecord(id:string,project:string,change:(data:any)=>any){
 for(let retry=0;retry<3;retry++){
  const row=await record(id,project);if(row.type!=='copywriting')throw new HttpError(404,'文案不存在。');
  if(row.data.status==='succeeded')return row.data;
  const next=change(row.data);
  const result=await database().prepare("UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND type='copywriting' AND revision=?")
   .bind(JSON.stringify(next),now(),id,project,row.revision).run();
  if(result.meta.changes===1)return next;
 }
 throw new HttpError(409,'原记录正在更新，请稍后查询。');
}
export function completedCopy(data:any,output:ReturnType<typeof decodeDifyResult>){
 const input=copyInput.parse(data.input);
 const copy=completeCopy(decodeCopy(('v2_output' in output?output.v2_output?.structured_output.publish_copy:undefined),input.event),input);
 const {error:_error,...previous}=data;
 return {...previous,status:'succeeded',review_status:output.result.status,validation_errors:('v2_output' in output?output.v2_output?.validation_errors:[])||[],...copy,workflow_run_id:output.workflow_run_id,elapsed:output.elapsed,tokens:output.tokens,warnings:output.result.warnings,to_confirm:output.result.to_confirm};
}
export async function recoverCopywriting(id:string,project:string){
 const row=await record(id,project);if(row.type!=='copywriting')throw new HttpError(404,'文案不存在。');
 if(row.data.status==='succeeded')return row.data;
 const runId=row.data.workflow_run_id;
 if(!runId||!row.data.dify_request)throw new HttpError(409,'这条记录没有完整的运行编号和输入快照，请在 Dify 核对；不会重新生成。');
 const input=copyInput.parse(row.data.input),request=requestSchema.parse(row.data.dify_request);
 if(input.project_id!==project||request.project_context.project_id!==project||request.run_id!==input.request_id||request.agent_key!=='graphic')throw new HttpError(409,'记录与原输入不匹配，未查询。');
 const run=await queryStoredDifyRun(runId);
 if(row.data.workflow_id&&run.workflow_id&&row.data.workflow_id!==run.workflow_id)throw new HttpError(409,'原运行的工作流版本不匹配。');
 // decodeProfessionalOutput also checks request ID, role and exact source versions.
 let final:any;
 if(run.status==='succeeded')final=completedCopy(row.data,decodeDifyResult('graphic',run,request));
 else if(['failed','stopped'].includes(run.status))final={...row.data,status:'failed',error:'Dify 已确认原运行失败或停止。已保留识图结果和运行编号。',remote_status:run.status};
 else final={...row.data,status:run.status==='running'?'running':'unknown',remote_status:run.status,error:run.status==='running'?'原任务仍在运行，可稍后再次查询。':run.status==='paused'?'原任务等待人工输入，请在 Dify 完成后再查询。':'原任务部分完成，请核对 Dify 日志，不要重新提交。'};
 return updateCopyRecord(id,project,current=>{
  if(current.workflow_run_id!==runId)throw new HttpError(409,'运行编号已变化，未覆盖原记录。');
  return {...current,...final,last_checked_at:now()};
 });
}
