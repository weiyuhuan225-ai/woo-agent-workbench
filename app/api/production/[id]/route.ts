import {z} from 'zod';
import {checkOrigin,failure,HttpError,database,now} from '@/lib/server';
import {readBatch,mutateBatch} from '@/lib/production-store';
import {reviewArtifact,retryJob,cancelQueuedJob} from '@/lib/production-batch';
import {batchView,controlBatch,loadProductionArtifact} from '@/lib/production-server';
import {executeProductionStep,bindOriginalRun} from '@/lib/production-executor';
import {validateArtifactDependencies} from '@/lib/production-edit';
const action=z.object({project_id:z.string().min(1),revision:z.number().int().positive(),action:z.enum(['review','retry','cancel','start','pause','recover','bind']),slot:z.string().max(100).optional(),hash:z.string().max(64).optional(),decision:z.enum(['approved','rejected','pending']).optional(),workflow_run_id:z.string().uuid().optional(),consent:z.literal(true)}).strict();
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await batchView(await readBatch(new URL(req.url).searchParams.get('project_id')||'',(await params).id)),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(req);const b=action.parse(await req.json()),id=(await params).id,s=await readBatch(b.project_id,id);if(s.revision!==b.revision)throw new HttpError(409,'批次已改变，请刷新后操作。');
 if(['start','pause'].includes(b.action)){await controlBatch(b.project_id,id,b.action==='start');return Response.json(await batchView(s))}
 if(b.action==='recover'){
  // Explicit query/download recovery may never start a queued generation.
  if(!s.data.jobs.some(j=>['running','unknown'].includes(j.state)&&j.attempts.at(-1)?.workflow_run_id))throw new HttpError(409,'没有可查询的原运行；不会重新提交。');
  return Response.json(await batchView(await executeProductionStep(b.project_id,id,true)));
 }
 if(!b.slot)throw new HttpError(400,'缺少槽位。');
 if(b.action==='bind'){if(!b.workflow_run_id)throw new HttpError(400,'缺少原运行编号。');return Response.json(await batchView(await bindOriginalRun(b.project_id,id,b.slot,b.workflow_run_id)))}
 const reviewed=b.action==='review'?await loadProductionArtifact(b.project_id,id,b.slot):null;
 if(reviewed&&b.decision==='approved'&&b.slot.startsWith('poster')&&s.data.input.quality_control){const qc=s.data.jobs.find(j=>j.slot==='quality-'+b.slot),repair=s.data.jobs.find(j=>j.slot==='repair-'+b.slot);if(qc?.state!=='succeeded'||!['succeeded','cancelled'].includes(repair?.state||''))throw new HttpError(409,'品牌质检或一轮返修尚未归档，请先核对')}
 if(reviewed&&b.decision==='approved')await validateArtifactDependencies(b.project_id,id,reviewed.artifact);
 const next=await mutateBatch(b.project_id,id,b.revision,x=>b.action==='review'?reviewArtifact(x,b.slot!,b.hash||'',b.decision||'pending'):b.action==='retry'?retryJob(x,b.slot!):cancelQueuedJob(x,b.slot!));
 if(reviewed?.artifact.asset_id&&b.decision==='approved')await database().prepare("UPDATE records SET data=json_set(data,'$.review_status','approved','$.production_approval_hash',?),revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND type='asset'").bind(b.hash,now(),reviewed.artifact.asset_id,b.project_id).run();
 return Response.json(await batchView(next));
 }catch(e){return failure(e)}}
