import {z} from 'zod';
import {writingPolicySchema,planningSchema} from './production-plan';

/** V3-02 foundation, not a scheduler. No provider calls or user-facing start button here. */
const id = z.string().trim().min(1).max(200);
const revision = z.number().int().nonnegative();
const allowance = z.object({text:z.number().int().min(0).max(100),image:z.number().int().min(0).max(100),video_seconds:z.number().int().min(0).max(600)}).strict();
export const batchInputSchema = z.object({
 project_id:id, request_id:z.string().uuid(), project_revision:revision, activity_revision:revision,
 activity:z.object({event_name:id,time:z.string().max(200),place:z.string().max(200),contact:z.string().max(500),mandatory:z.string().max(6000)}).strict(),
 approved_brief:z.object({id,revision,theme:id,cta:z.string().max(1000),style:z.string().max(1000),source_ids:z.array(id).min(1).max(100),source_snapshots:z.array(z.object({id,revision,sha256:z.string().regex(/^[a-f0-9]{64}$/),text:z.string().min(1).max(30000)}).strict()).max(10).optional()}).strict(),
 brand:z.object({id,revision,asset_ids:z.array(id).max(30)}).strict(),
 reuse_only:z.boolean().optional(),
 production_scope:z.array(z.string().regex(/^(poster-[1-4]|copy-(weibo|xiaohongshu|douyin|moments))$/)).min(1).max(8).optional(),
 quality_control:z.boolean().optional(),
 brand_profile:z.object({id,revision,sha256:z.string(),data:z.record(z.string(),z.unknown())}).optional(),
 approved_memory:z.array(z.object({id,revision,sha256:z.string(),channel:id,style:id,activity_type:id,text:z.string().max(6000)})).max(3).optional(),
 budget:allowance, media_concurrency:z.number().int().min(1).max(2).default(1),
 workflow_version:id,
 image_grounding:z.boolean().default(false),
 writing_policy:writingPolicySchema.optional(),
 planning:planningSchema.optional(),
 configuration:z.object({version:id,schema:id,font_sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),workflow_id:z.string().uuid().optional(),image_model:id,vision_model:id,workflow_version:id,tools:z.array(id).max(20),digest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
 brand_layers:z.object({logo:z.object({asset_id:id,revision,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),qr_url:z.string().url().max(500).optional()}).strict().optional(),
 project_snapshot:z.object({name:id,brand:z.string().max(300),school:z.string().max(300)}).strict().optional(),
}).strict();
export type BatchInput=z.infer<typeof batchInputSchema>;
export type Allowance=z.infer<typeof allowance>;
export type JobState='queued'|'claimed'|'submitting'|'running'|'unknown'|'succeeded'|'failed'|'cancelled';
export type ReviewState='pending'|'approved'|'rejected';
export type Attempt={id:string;state:'reserved'|'spent'|'released';units:Allowance;lease_until:number;started_at:number;workflow_run_id?:string;provider_task_id?:string;reason?:string};
export type Artifact={id:string;sha256:string;input_hash:string;workflow_run_id:string};
export type ProductionJob={slot:string;kind:'text'|'image';state:JobState;review:ReviewState;attempts:Attempt[];artifact?:Artifact;error?:string;stage?:'download_pending'|'validation_pending';reviews?:{hash:string;decision:ReviewState;at:string}[];recovery_history?:{at:string;workflow_run_id:string;result:'archived'|'running'|'failed'|'query_error'}[];artifact_history?:{artifact:Artifact;review:ReviewState;reviews:NonNullable<ProductionJob['reviews']>;at:string;reason:string}[]};
export type ProductionBatch={schema_version:1;id:string;input:BatchInput;input_hash:string;created_at:string;jobs:ProductionJob[]};
export class BatchConflict extends Error {}
const zero=():Allowance=>({text:0,image:0,video_seconds:0});
const unit=(kind:ProductionJob['kind']):Allowance=>({...zero(),[kind]:1});

export function stableJson(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
 return '{'+Object.keys(value as object).sort().map(k=>JSON.stringify(k)+':'+stableJson((value as Record<string,unknown>)[k])).join(',')+'}';
}
export async function inputHash(input:BatchInput){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(input)));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function newBatch(raw:unknown,createdAt=new Date().toISOString()):Promise<ProductionBatch>{
 const input=batchInputSchema.parse(raw);
 const scope=input.production_scope,posterCount=scope?scope.filter(s=>s.startsWith('poster-')).length:4,copyCount=scope?scope.filter(s=>s.startsWith('copy-')).length:4;
 if(scope&&new Set(scope).size!==scope.length)throw new BatchConflict('生产范围不可重复');
 if(!input.reuse_only&&scope&&input.image_grounding&&scope.includes('copy-douyin')&&!scope.includes('poster-1'))throw new BatchConflict('抖音配文依赖需要同时选择海报1');
 const requiredText=copyCount+(input.image_grounding?1:0)+(input.quality_control?posterCount:0),requiredImages=posterCount*(input.quality_control?2:1);
 if(!input.reuse_only&&(input.budget.image<requiredImages||input.budget.text<requiredText))throw new BatchConflict('本次范围与依赖的调用上限不足；请确认预算，不自动提高');
 const slots=[...Array.from({length:4},(_,i)=>({slot:`poster-${i+1}`,kind:'image' as const})),
 ...(input.image_grounding?[{slot:'vision-poster-1',kind:'text' as const}]:[]),
 ...(input.quality_control?Array.from({length:4},(_,i)=>({slot:`quality-poster-${i+1}`,kind:'text' as const})).filter(j=>!scope||scope.includes(j.slot.slice(8))):[]),
 ...(input.quality_control?Array.from({length:4},(_,i)=>({slot:`repair-poster-${i+1}`,kind:'image' as const})).filter(j=>!scope||scope.includes(j.slot.slice(7))):[]),
 ...['weibo','xiaohongshu','douyin','moments'].map(p=>({slot:`copy-${p}`,kind:'text' as const}))];
 return {schema_version:1,id:`production-${input.request_id}`,input,input_hash:await inputHash(input),created_at:createdAt,
 jobs:slots.map(s=>({...s,state:scope&&/^(poster-|copy-)/.test(s.slot)&&!scope.includes(s.slot)?'cancelled':'queued',review:'pending',attempts:[]}))};
}
export function budgetUsage(batch:ProductionBatch){
 const reserved=zero(),spent=zero();
 for(const job of batch.jobs)for(const attempt of job.attempts){
  const into=attempt.state==='reserved'?reserved:attempt.state==='spent'?spent:null;
  if(into)for(const key of Object.keys(into) as (keyof Allowance)[])into[key]+=attempt.units[key];
 }
 return {reserved,spent,currency_actual:null,pricing:'unknown' as const};
}
function jobAt(batch:ProductionBatch,slot:string){const job=batch.jobs.find(j=>j.slot===slot);if(!job)throw new BatchConflict('产物槽位不存在。');return job}
function ownedAttempt(job:ProductionJob,attemptId:string){const a=job.attempts.at(-1);if(!a||a.id!==attemptId)throw new BatchConflict('运行尝试已变更，旧执行器不得更新当前任务。');return a}
function edit(batch:ProductionBatch,fn:(copy:ProductionBatch)=>void){const copy=structuredClone(batch);fn(copy);return copy}
function leaseDuration(ms:number){if(!Number.isInteger(ms)||ms<1000||ms>300000)throw new BatchConflict('执行租约必须在一秒至五分钟之间。')}

/** Caller persists this with CAS before it may submit anything. */
export function claimJob(batch:ProductionBatch,slot:string,attemptId:string,nowMs:number,leaseMs=60000){
 leaseDuration(leaseMs);
 return edit(batch,b=>{
  const job=jobAt(b,slot);if(job.state!=='queued')throw new BatchConflict('任务不是待执行状态，不可重复认领。');
  if(!attemptId||b.jobs.some(j=>j.attempts.some(a=>a.id===attemptId)))throw new BatchConflict('尝试编号不可重复。');
  if(job.kind==='image'&&b.jobs.filter(j=>j.kind==='image'&&['claimed','submitting','running','unknown'].includes(j.state)).length>=b.input.media_concurrency)throw new BatchConflict('媒体并发已达上限；未知任务仍占用名额。');
  const usage=budgetUsage(b),units=unit(job.kind);
  for(const k of Object.keys(units) as (keyof Allowance)[])if(usage.spent[k]+usage.reserved[k]+units[k]>b.input.budget[k])throw new BatchConflict('本批调用上限不足，需要确认新的预算或新批次。');
  job.attempts.push({id:attemptId,state:'reserved',units,lease_until:nowMs+leaseMs,started_at:nowMs});job.state='claimed';delete job.error;
 });
}
/** Persist the submitting marker BEFORE contacting Dify. A crash after it is uncertain. */
export function beginSubmission(batch:ProductionBatch,slot:string,attemptId:string,nowMs:number){return edit(batch,b=>{
 const j=jobAt(b,slot),a=ownedAttempt(j,attemptId);if(j.state!=='claimed'||a.lease_until<=nowMs)throw new BatchConflict('租约已失效或任务已提交。');j.state='submitting';
})}
export function releaseUnsubmitted(batch:ProductionBatch,slot:string,attemptId:string){return edit(batch,b=>{const j=jobAt(b,slot),a=ownedAttempt(j,attemptId);if(j.state!=='claimed')throw new BatchConflict('已提交的预算不可释放。');a.state='released';a.reason='local_preflight_failed';j.state='queued';})}
export function attachRemote(batch:ProductionBatch,slot:string,attemptId:string,workflowRunId:string,providerTaskId?:string){return edit(batch,b=>{
 const j=jobAt(b,slot),a=ownedAttempt(j,attemptId);if(!['submitting','unknown','running'].includes(j.state)||!workflowRunId.trim())throw new BatchConflict('不能为该状态绑定远端运行。');
 if(a.workflow_run_id&&a.workflow_run_id!==workflowRunId)throw new BatchConflict('运行号冲突，禁止覆盖原运行。');
 if(a.provider_task_id&&providerTaskId&&a.provider_task_id!==providerTaskId)throw new BatchConflict('供应商任务号冲突。');
 a.workflow_run_id=workflowRunId;if(providerTaskId)a.provider_task_id=providerTaskId;j.state='running';delete j.error;
})}
export function heartbeat(batch:ProductionBatch,slot:string,attemptId:string,nowMs:number,leaseMs=60000){leaseDuration(leaseMs);return edit(batch,b=>{
 const j=jobAt(b,slot),a=ownedAttempt(j,attemptId);if(!['claimed','submitting','running'].includes(j.state)||a.lease_until<=nowMs)throw new BatchConflict('无法续期已失效的执行租约。');a.lease_until=nowMs+leaseMs;
})}
export function recoverExpired(batch:ProductionBatch,nowMs:number){return edit(batch,b=>{
 for(const j of b.jobs){const a=j.attempts.at(-1);if(!a||a.lease_until>nowMs)continue;
  if(j.state==='claimed'){a.state='released';a.reason='lease_expired_before_submit';j.state='queued'}
  else if(j.state==='submitting'){j.state='unknown';j.error='提交后未取得可靠运行号；保留预算，不自动重新提交。'}
  // running has a durable run ID: only query that run, never send a new generation.
 }
})}
export function markUnknown(batch:ProductionBatch,slot:string,attemptId:string){return edit(batch,b=>{
 const j=jobAt(b,slot);ownedAttempt(j,attemptId);if(!['submitting','running'].includes(j.state))throw new BatchConflict('该任务没有待核对的提交。');j.state='unknown';j.error='结果未确认，先查询原运行；不会重复扣费提交。';
})}
/** Use only after a provider confirms a terminal state. An HTTP error alone is not proof. */
export function finishJob(batch:ProductionBatch,slot:string,attemptId:string,result:{status:'succeeded';artifact:Artifact}|{status:'failed';workflow_run_id:string;reason:string}){return edit(batch,b=>{
 const j=jobAt(b,slot),a=ownedAttempt(j,attemptId);if(!['running','unknown'].includes(j.state)||!a.workflow_run_id)throw new BatchConflict('需先绑定并核对远端运行号。');
 const runId=result.status==='succeeded'?result.artifact.workflow_run_id:result.workflow_run_id;
 if(runId!==a.workflow_run_id)throw new BatchConflict('结果不属于当前运行。');
 if(result.status==='succeeded'){
  const artifact=result.artifact;
  if(!artifact.id||!/^[a-f0-9]{64}$/.test(artifact.sha256)||artifact.input_hash!==b.input_hash)throw new BatchConflict('产物归档或输入版本不匹配。');
  j.artifact={...artifact};j.state='succeeded';j.review='pending';delete j.error;delete j.stage;
 }else{j.state='failed';j.error=result.reason.slice(0,1000)}
 // Call allowances are conservative, not a currency billing assertion. Failed calls also count.
 a.state='spent';
})}
export function retryJob(batch:ProductionBatch,slot:string){return edit(batch,b=>{
 const j=jobAt(b,slot);if(slot.startsWith('repair-')&&j.attempts.length)throw new BatchConflict('受控返修最多一轮；请人工处理');if(j.state!=='failed')throw new BatchConflict('仅远端确认失败的槽位可以重试；成功和未知任务不可重做。');j.state='queued';j.review='pending';
})}
export function cancelQueuedJob(batch:ProductionBatch,slot:string){return edit(batch,b=>{
 const j=jobAt(b,slot);if(!['queued','claimed'].includes(j.state))throw new BatchConflict('已提交任务必须核对远端状态，不能只在本地取消。');
 const a=j.attempts.at(-1);if(j.state==='claimed'&&a)a.state='released';j.state='cancelled';
})}
export function reviewArtifact(batch:ProductionBatch,slot:string,artifactHash:string,decision:ReviewState){return edit(batch,b=>{
 const j=jobAt(b,slot);if(j.state!=='succeeded'||!j.artifact||j.artifact.sha256!==artifactHash)throw new BatchConflict('只能审核当前已归档的产物版本。');j.review=decision;j.reviews=[...(j.reviews||[]),{hash:artifactHash,decision,at:new Date().toISOString()}];
})}
export function exportableArtifacts(batch:ProductionBatch){return batch.jobs.filter(j=>j.state==='succeeded'&&j.review==='approved'&&j.artifact).map(j=>({slot:j.slot,...j.artifact!}))}
