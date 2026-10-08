import {ensureUnifiedTasks} from '@/lib/unified-tasks';
import {validateActivity} from '@/lib/activity-server';
import {z} from 'zod';
import {agentKeys,agentBriefs} from '@/lib/agent-contract';
import {database,checkOrigin,failure,now,HttpError,record} from '@/lib/server';
import {configured,runDify} from '@/lib/dify';
import {closeoutText} from '@/lib/closeout';
import {buildProjectSnapshot} from '@/lib/project-snapshot';
import {closeoutPolicy} from '@/lib/closeout-baseline';
import {buildProfessionalRequest,independentKeys} from '@/lib/dify-v21';
const input=z.object({activity_revision:z.number().int().min(0).default(0),project_id:z.string().min(1).max(100),project_revision:z.number().int().positive(),request_id:z.string().uuid(),instruction:z.string().trim().min(5).max(3000),reference_text:z.string().max(5000).default(''),include_closeout:z.boolean().default(false),upstream_run_ids:z.array(z.string().max(100)).max(7).default([])});
export async function POST(req:Request,{params}:{params:Promise<{key:string}>}){
 let runId='',lockId='',locked=false;
 try{checkOrigin(req);const key=z.enum(agentKeys).parse((await params).key),b=input.parse(await req.json()),db=database();
 const project=await db.prepare('SELECT * FROM projects WHERE id=?').bind(b.project_id).first<any>();if(!project)throw new HttpError(404,'项目不存在。');
 const id='run-'+b.request_id;const fingerprint=JSON.stringify({key,...b});
 const previous=await db.prepare('SELECT data,project_id FROM records WHERE id=?').bind(id).first<any>();
 if(previous){const d=JSON.parse(previous.data);if(previous.project_id!==b.project_id||d.fingerprint!==fingerprint)throw new HttpError(409,'请求标识重复，请重新打开生成窗口。');return Response.json({id,...d},{status:d.status==='running'?202:200})}
 if(project.revision!==b.project_revision)throw new HttpError(409,'项目简报已更新，请刷新后生成。');
 await validateActivity(b.project_id,b.activity_revision);if(!configured())throw new HttpError(503,'工作流已准备，等待配置 Dify 服务端密钥。当前没有发起模型调用。');
 if(b.include_closeout&&b.project_id!=='woo-original')throw new HttpError(400,'此项目没有乐虎结案资料。');
 const upstream=[];for(const rid of b.upstream_run_ids){const r=await record(rid,b.project_id);if(r.type!=='run'||r.data.review_status!=='approved'||(r.data.result?.execution_mode==='mock'||r.data.v2_output?.execution_mode==='mock'))throw new HttpError(400,'上游结果必须人工批准，且不得为模拟产物。');upstream.push({run_id:r.id,workflow_run_id:r.data.workflow_run_id,result:r.data.v2_output||r.data.result,reviewed_at:r.data.review_history?.at(-1)?.at});}
 lockId='agent-lock-'+b.project_id;const t=now();
 const lock=await db.prepare("INSERT INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,'agent_lock','{}',1,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at WHERE records.updated_at < ?").bind(lockId,b.project_id,t,t,new Date(Date.now()-150000).toISOString()).run();
 if(!lock.meta.changes)throw new HttpError(409,'这个项目已有生成任务，请稍后刷新运行记录。');locked=true;
 await ensureUnifiedTasks(b.project_id);
 const {results:businessRows}=await db.prepare("SELECT id,type,data,revision,updated_at FROM records WHERE project_id=? AND type IN ('task','budget','asset','content','run','procurement','execution_plan','activity_settings') ORDER BY id").bind(b.project_id).all<any>();
 const activityRevision=businessRows.find(r=>r.type==='activity_settings')?.revision||0;const snapshot=buildProjectSnapshot(project,businessRows,b.include_closeout,upstream);
 const legacyBrief=JSON.stringify({source_priority:b.project_id==='woo-original'?closeoutPolicy:'执行事实与计划分开，优先使用经确认的执行资料',project:{name:project.name,brand:project.brand,school:project.school,goal:project.goal,brief:project.brief,source_note:project.source_note},reference_text:b.reference_text,approved_upstream:upstream,project_snapshot:snapshot,closeout:b.include_closeout?closeoutText:'未选择结案资料'});
 const professionalRequest=independentKeys.includes(key)?buildProfessionalRequest(key,b.request_id,project,snapshot,b.reference_text,b.include_closeout?closeoutText:'',upstream,b.instruction):undefined;
 const brief=professionalRequest?JSON.stringify(professionalRequest):legacyBrief;
 if(brief.length>50000)throw new HttpError(400,'简报和参考资料超过50000字，请缩短后重试。');
 runId=id;const data={activity_revision:activityRevision,key,status:'running',review_status:'awaiting_review',upstream_run_ids:b.upstream_run_ids,source_set:professionalRequest?.source_set||snapshot.source_set,request_contract:professionalRequest,project_snapshot:snapshot,instruction:b.instruction,project_revision:b.project_revision,reference_text:b.reference_text,include_closeout:b.include_closeout,fingerprint};
 await db.prepare('INSERT INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,?, ?,1,?,?)').bind(id,b.project_id,'run',JSON.stringify(data),t,t).run();
 const output=await runDify(key,brief,`能力类型：${key}\n专业要求：${agentBriefs[key]}\n本次任务：${b.instruction}`,b.project_id,professionalRequest);
 const final={...data,status:output.result.status,...output};await db.prepare('UPDATE records SET data=?,updated_at=? WHERE id=?').bind(JSON.stringify(final),now(),id).run();return Response.json({id,...final});
 }catch(e){if(runId){const db=database();const row=await db.prepare('SELECT data FROM records WHERE id=?').bind(runId).first<any>();if(row){const d=JSON.parse(row.data);await db.prepare('UPDATE records SET data=?,updated_at=? WHERE id=?').bind(JSON.stringify({...d,status:'failed',error:e instanceof Error?e.message:'生成失败'}),now(),runId).run()}}if(e instanceof HttpError||e instanceof z.ZodError)return failure(e);return Response.json({error:e instanceof Error&&e.name==='TimeoutError'?'等待超过95秒。请先检查 Dify 日志，本次请求可能仍在运行，避免立即重复付费调用。':e instanceof Error?e.message:'生成失败'},{status:502});}
 finally{if(locked)await database().prepare('DELETE FROM records WHERE id=?').bind(lockId).run()}
}
