import {validateActivity} from '@/lib/activity-server';
import {streamJson} from '@/lib/stream-json';
import {z} from 'zod';
import {posterInput,posterInstruction} from "@/lib/poster-contract";
import {database,bucket,checkOrigin,record,now,failure,HttpError} from "@/lib/server";
import {validateExecutionTask,sharedIP} from '@/lib/execution-server';
import {referenceImage} from "@/lib/ark";
import {configured,runDify} from "@/lib/dify";
import {buildProjectSnapshot} from "@/lib/project-snapshot";
import {buildProfessionalRequest} from "@/lib/dify-v21";
import {agentBriefs} from "@/lib/agent-contract";
async function planPoster(req:Request){let id="",inserted=false;try{checkOrigin(req);const b=posterInput.parse(await req.json());await validateActivity(b.project_id,b.activity_revision);await validateExecutionTask(b.project_id,b.execution_task_id,b.usage==='offline'?'offline':'online');const db=database(),p=await db.prepare("SELECT * FROM projects WHERE id=?").bind(b.project_id).first<any>();if(!p)throw new HttpError(404,"项目不存在。");id="poster-"+b.request_id;const fingerprint=JSON.stringify(b);const old=await db.prepare("SELECT * FROM records WHERE id=?").bind(id).first<any>();if(old){const data=JSON.parse(old.data);if(old.project_id!==b.project_id||data.fingerprint!==fingerprint)throw new HttpError(409,"请求标识冲突。");return Response.json({id,...data})}if(p.revision!==b.project_revision)throw new HttpError(409,"项目已更新，请刷新。");if(!configured())throw new HttpError(503,"海报工作流尚未连接。");let reference="",rows:any[]=[];if(b.asset_id){const a=await sharedIP(b.asset_id);if(a.data.category!=="IP与视觉")throw new HttpError(400,"请选择IP资产。");reference=await referenceImage(b.asset_id,a.project_id);rows=[a]}
 const t=now(),data:any={brief:b,fingerprint,status:"planning",review_status:"awaiting_review",slots:[0,1,2,3].map(slot=>({slot,status:"pending"})),input_confirmation:{at:t,action:"用户确认创作要求并开始生成",consent:true}};const added=await db.prepare("INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,'poster_batch',?,1,?,?)").bind(id,b.project_id,JSON.stringify(data),t,t).run();if(!added.meta.changes)throw new HttpError(409,"同一海报任务已提交。");inserted=true;await bucket().put("_private/poster-reference/"+id,JSON.stringify({project_id:b.project_id,image:reference}));
 const snapshot=buildProjectSnapshot(p,rows,false,[]);const professional=buildProfessionalRequest("poster",b.request_id,p,snapshot,"","",[],posterInstruction(b));
 const plan=await runDify("poster",JSON.stringify(professional),"能力类型：poster\n专业要求："+agentBriefs.poster+"\n独立项目海报创作，线上或线下用途以本次表单为准，用户确认表单，无需策略上游批准。无page的source禁止补页码；缺少年份允许留空，不阻断草稿，正常返回awaiting_review。\n本次任务："+posterInstruction(b),b.project_id,professional);
 data.plan=plan;await db.prepare("UPDATE records SET data=?,updated_at=? WHERE id=?").bind(JSON.stringify(data),now(),id).run();
 if(plan.result.status!=="awaiting_review"||('v2_output' in plan?plan.v2_output:undefined)?.validation_errors.length)throw new HttpError(422,"设计流程需要补充资料，未提交生图。请查看设计说明后调整要求。");
 const spec=('v2_output' in plan?plan.v2_output:undefined)?.structured_output?.poster_spec as Record<string,unknown>|undefined;const prompt=spec?.prompt;if(typeof prompt!=="string"||prompt.length<5)throw new HttpError(502,"设计流程未返回有效画面说明，未提交生图。");
 Object.assign(data,{status:"ready",plan,visual_prompt:prompt});await db.prepare("UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=?").bind(JSON.stringify(data),now(),id).run();return Response.json({id,...data},{status:201});
 }catch(e){if(id&&inserted){const r=await database().prepare("SELECT data FROM records WHERE id=?").bind(id).first<any>();if(r){const d=JSON.parse(r.data);if(d.status==="planning")await database().prepare("UPDATE records SET data=?,updated_at=? WHERE id=?").bind(JSON.stringify({...d,status:"failed",error:e instanceof Error?e.message:"策划失败"}),now(),id).run()}}return e instanceof HttpError||e instanceof z.ZodError?failure(e):Response.json({error:e instanceof Error?e.message:"海报策划失败"},{status:502})}}

export async function POST(req:Request){return req.headers.get("X-WOO-Stream")==="1"?streamJson(()=>planPoster(req)):planPoster(req)}
