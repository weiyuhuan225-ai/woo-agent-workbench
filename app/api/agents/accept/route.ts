import {z} from 'zod';
import {database,checkOrigin,record,now,failure,HttpError} from '@/lib/server';
import {outputSchema,canApproveV2} from '@/lib/v2-contract';
export async function POST(req:Request){try{
 checkOrigin(req);const b=z.object({run_id:z.string(),project_id:z.string(),kind:z.enum(['topic','poster','live_script','ai_script','graphic','research','strategy','review']),note:z.string().max(2000).default('人工审核通过')}).parse(await req.json());
 const r=await record(b.run_id,b.project_id),id='accepted-'+r.id;
 if(r.type!=='run'||!r.data.result)throw new HttpError(400,'只能审核已完成的生成结果。');
 if(r.data.review_status==='approved')return Response.json({id,review_status:'approved'});
 if(r.data.status!=='awaiting_review'||r.data.result.execution_mode==='mock')throw new HttpError(400,'此结果不可批准。模拟或待补充结果不能作为下游依据。');
 if(r.data.v2_output){const v=outputSchema.safeParse(r.data.v2_output);if(!v.success||!canApproveV2(v.data))throw new HttpError(400,'专业流程未通过结构和来源校验，不能批准。');}
 const x=r.data.result,t=now(),event={decision:'approved',note:b.note,at:t,project_revision:r.data.project_revision};
 const updated={...r.data,status:'approved',review_status:'approved',review_history:[...(r.data.review_history||[]),event]};
 const body=[x.body,'\n事实依据',...x.evidence,'\n待确认',...x.to_confirm,'\n注意事项',...x.warnings].join('\n');
 const result=await database().batch([
 database().prepare('UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(updated),t,r.id,r.revision),
 database().prepare("INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) SELECT ?,?,'content',?,1,?,? FROM records WHERE id=? AND revision=? AND json_extract(data,'$.review_status')='approved'").bind(id,b.project_id,JSON.stringify({title:x.title,kind:b.kind,channel:'',task_id:'',status:'draft',body,source:'Dify · '+r.data.key+' · '+r.id,upstream_run_id:r.id,review_status:'approved',reviewed_at:t}),t,t,r.id,r.revision+1)
 ]);
 if(!result[0].meta.changes)throw new HttpError(409,'审核状态已变更，请刷新后重试。');
 return Response.json({id,review_status:'approved'});
 }catch(e){return failure(e)}}
