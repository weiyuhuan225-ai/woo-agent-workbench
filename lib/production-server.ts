import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {database,bucket,record,projectExists,HttpError,now} from './server';
import {activityRecord} from './activity-server';
import {newBatch,budgetUsage,stableJson,type ProductionBatch} from './production-batch';
import {createBatch,readBatch,type StoredBatch} from './production-store';
import {sha256,layoutSpec,type LayoutSpec} from './production-content';
import {referenceImage,publicConfig} from './ark';
import {sharedIP} from './execution-server';
import {planningSchema,writingPolicySchema,briefPreflight,approvedTopicDirections} from './production-plan';
import {visionModel} from './dify-vision';
import {brandSnapshot,memorySnapshot} from './production-brand';
import {productionFont} from './production-font';

const settings=()=>env as unknown as Record<string,string>;
export function executorCapability(){return {configured:!!settings().WOO_EXECUTOR_TOKEN,enabled:settings().WOO_EXECUTOR_ENABLED==='1',verified:settings().WOO_EXECUTOR_VERIFIED==='1',workflow_version:'orchestrator-15',image_grounding:true}}
export async function executorAuthorization(req:Request){const secret=settings().WOO_EXECUTOR_TOKEN;if(!secret||await sha256(req.headers.get('authorization')||'')!==await sha256('Bearer '+secret))throw new HttpError(403,'执行器未授权。')}
export async function productionConfiguration(){const c=await publicConfig(),snapshot={version:'production-config-3',schema:'2.1',font_sha256:productionFont.sha256,workflow_id:settings().WOO_DIFY_WORKFLOW_ID||'11111111-1111-4111-8111-111111111111',image_model:c.image_model,vision_model:visionModel,workflow_version:settings().WOO_DIFY_PUBLISHED_VERSION||'orchestrator-15',tools:['Dify Service API','media_reference_image','media_vision','graphic']};return {...snapshot,digest:await sha256(stableJson({...snapshot,credential_fingerprint:await sha256(settings().DIFY_WORKFLOW_API_KEY||'')}))}}
export async function assertProductionConfiguration(b:ProductionBatch){if(b.input.configuration&&(await productionConfiguration()).digest!==b.input.configuration.digest)throw new HttpError(409,'本批锁定的模型或流程配置已变化，后续提交暂停；原运行仍可查询。请核对配置后重新确认生产计划。')}
export const briefSchema=z.object({project_id:z.string().min(1),activity_revision:z.number().int().nonnegative(),theme:z.string().trim().min(1).max(150),cta:z.string().trim().max(500),style:z.string().trim().min(1).max(1000),asset_id:z.string().min(1).max(200),source_ids:z.array(z.string().min(1).max(200)).max(30),memory_ids:z.array(z.string()).max(3).optional(),planning:planningSchema.optional(),writing_policy:writingPolicySchema.optional(),logo_asset_id:z.string().max(200).optional(),qr_url:z.string().max(500).optional(),consent:z.literal(true)}).strict();
export async function approveBrief(raw:unknown){
 const b=briefSchema.parse(raw);await projectExists(b.project_id);const a=await activityRecord(b.project_id);if(!a||a.revision!==b.activity_revision)throw new HttpError(409,'请先保存并核对本次活动信息。');
 const asset=await sharedIP(b.asset_id);
 if(asset.data.generated&&asset.data.review_status!=='approved')throw new HttpError(400,'生成参考图需要先审核。');
 await referenceImage(asset.id,asset.project_id);
 for(const id of b.source_ids)await record(id,b.project_id);
 const source_snapshots=[];for(const id of [...new Set([...b.source_ids,...(b.planning?.research.source_ids||[])])]){const r=await record(id,b.project_id);if(r.type!=='run'||r.data.review_status!=='approved'||r.data.v2_output?.execution_mode!=='live'||r.data.project_revision!==(await database().prepare('SELECT revision FROM projects WHERE id=?').bind(b.project_id).first<any>()).revision||r.data.activity_revision!==a.revision)throw new HttpError(409,'选定来源必须是当前项目和活动版本的批准Agent结果。');const value=r.data.v2_output||r.data.result,text=String(r.data.v2_output?.readable_text||r.data.result?.body||'');if(!text||text.length>10000)throw new HttpError(400,'来源正文为空或超过10000字，请先准备适用的批准摘录。');source_snapshots.push({id:r.id,revision:r.revision,sha256:await sha256(stableJson(value)),text})}if(source_snapshots.length>10||source_snapshots.reduce((n,r)=>n+r.text.length,0)>20000)throw new HttpError(400,'本次选定来源过多，请只引用直接相关的批准资料。');
 if(b.planning){for(const id of b.planning.research.source_ids){const source=await record(id,b.project_id);if(source.type==='run'&&source.data.review_status!=='approved')throw new HttpError(400,'规划引用的Agent结果需要先批准。')}
  if(b.planning.research.decision==='reuse'&&!b.planning.research.source_ids.length)throw new HttpError(400,'复用调研需要选定来源。');
  if(b.planning.direction.origin==='approved_topic'){const source=await record(b.planning.direction.topic_run_id||'',b.project_id),p=await database().prepare('SELECT revision FROM projects WHERE id=?').bind(b.project_id).first<any>(),matches=approvedTopicDirections([source],p.revision);if(!matches.some(d=>stableJson(d)===stableJson(b.planning!.direction)))throw new HttpError(409,'批准选题或项目版本已经变化，请重新选择。')}
 }
 let logo:NonNullable<ProductionBatch['input']['brand_layers']>['logo'];if(b.logo_asset_id){const l=await sharedIP(b.logo_asset_id),object=await bucket().get(l.data.storage_key);if(!object)throw new HttpError(404,'品牌标识文件不存在');logo={asset_id:l.id,revision:l.revision,sha256:await sha256(await object.arrayBuffer())}}
 if(b.qr_url){let url:URL;try{url=new URL(b.qr_url)}catch{throw new HttpError(400,'二维码目标需为完整网址。')}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new HttpError(400,'二维码仅支持无登录凭据的HTTP/HTTPS网址。')}
 const policy=b.writing_policy?{...b.writing_policy,version:'writing-rules-'+(await sha256(stableJson(b.writing_policy.rules))).slice(0,16)}:undefined;
 const id='content-brief-'+crypto.randomUUID(),t=now(),data={...b,...(policy?{writing_policy:policy}:{}),source_snapshots,brand_layers:{...(logo?{logo}:{}),...(b.qr_url?{qr_url:b.qr_url}:{})},preflight:briefPreflight(a.data,true),activity:{event_name:a.data.event_name,time:a.data.time,place:a.data.place,contact:a.data.contact,mandatory:a.data.mandatory},asset_revision:asset.revision,approved_at:t};
 await database().prepare("INSERT INTO records VALUES (?,?,'content_brief',?,1,?,?)").bind(id,b.project_id,JSON.stringify(data),t,t).run();return {id,revision:1,data};
}
export async function createProduction(raw:unknown){
 const b=z.object({project_id:z.string().min(1),brief_id:z.string().min(1),project_revision:z.number().int().positive(),request_id:z.string().uuid(),scope:z.array(z.string().regex(/^(poster-[1-4]|copy-(weibo|xiaohongshu|douyin|moments))$/)).min(1).max(8).optional(),budget:z.object({text:z.number().int().min(0).max(100),image:z.number().int().min(0).max(100),video_seconds:z.literal(0)}),quality_control:z.boolean().optional(),consent:z.literal(true)}).strict().parse(raw);
 const r=await record(b.brief_id,b.project_id);if(r.type!=='content_brief'||!r.data.approved_at)throw new HttpError(400,'先批准本次主题与品牌图。');
 const d=r.data;for(const snapshot of d.source_snapshots||[]){const source=await record(snapshot.id,b.project_id);if(source.revision!==snapshot.revision||source.data.review_status!=='approved'||await sha256(stableJson(source.data.v2_output||source.data.result))!==snapshot.sha256)throw new HttpError(409,'规划来源已改变，请重新批准简报。')}const a=await activityRecord(b.project_id);if(a?.revision!==d.activity_revision)throw new HttpError(409,'主题对应的活动版本已改变，需要重新批准。');
 const asset=await record(d.asset_id);if(asset.revision!==d.asset_revision)throw new HttpError(409,'品牌参考图已改变，需要重新批准。');
 const project=await database().prepare('SELECT name,brand,school FROM projects WHERE id=?').bind(b.project_id).first<any>();
 const configuration=await productionConfiguration(),brand_profile=await brandSnapshot(b.project_id),approved_memory=await memorySnapshot(b.project_id,asset.id,brand_profile?.sha256,d.memory_ids||[]);if(brand_profile&&(brand_profile.data.ip_asset_id!==asset.id||(brand_profile.data.logo_asset_id||'')!==(d.brand_layers?.logo?.asset_id||'')))throw new HttpError(409,'选择的IP/LOGO与品牌档案不同，请先核对品牌版本');
 const batch=await newBatch({project_id:b.project_id,project_revision:b.project_revision,request_id:b.request_id,activity_revision:a.revision,activity:d.activity,approved_brief:{id:r.id,revision:r.revision,theme:d.theme,cta:d.cta,style:d.style,source_ids:[...new Set([a.id,...d.source_ids,...(d.planning?.research.source_ids||[])])],...(d.source_snapshots?.length?{source_snapshots:d.source_snapshots}:{})},brand:{id:asset.id,revision:asset.revision,asset_ids:[asset.id,...(d.brand_layers?.logo?[d.brand_layers.logo.asset_id]:[])]},budget:b.budget,...(b.quality_control?{quality_control:true}:{}),...(brand_profile?{brand_profile}:{}),...(approved_memory.length?{approved_memory}:{}),media_concurrency:1,workflow_version:configuration.workflow_version,configuration,...(d.planning?{planning:d.planning}:{}),...(d.writing_policy?{writing_policy:d.writing_policy}:{}),...(d.brand_layers?{brand_layers:d.brand_layers}:{}),image_grounding:!b.scope||b.scope.includes('copy-douyin'),...(b.scope?{production_scope:b.scope}:{}),project_snapshot:project});
 const stored=await createBatch(batch),t=now();
 // Reference bytes are immutable private data, not a public data URL.
 if(!await bucket().get('_private/production-reference/'+batch.id))await bucket().put('_private/production-reference/'+batch.id,JSON.stringify({project_id:b.project_id,image:await referenceImage(asset.id,asset.project_id)}));
 await database().prepare("INSERT OR IGNORE INTO records VALUES (?,?,'production_control',?,1,?,?)").bind('control-'+batch.id,b.project_id,JSON.stringify({enabled:false}),t,t).run();
 return stored;
}
export async function controlBatch(projectId:string,id:string,enabled:boolean){const b=await readBatch(projectId,id);if(enabled){const c=executorCapability();if(!c.enabled||!c.verified)throw new HttpError(409,'后台联通与关页验证尚未完成，暂时只保存批次。');await assertProductionConfiguration(b.data);const a=await activityRecord(projectId);const p=await database().prepare('SELECT revision FROM projects WHERE id=?').bind(projectId).first<{revision:number}>();if(p?.revision!==b.data.input.project_revision||a?.revision!==b.data.input.activity_revision)throw new HttpError(409,'事实版本已改变，不能启动旧批次。')}
 await database().prepare("UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND type='production_control'").bind(JSON.stringify({enabled}),now(),'control-'+id,projectId).run();return {enabled};
}
export async function batchView(s:StoredBatch){const c=await record('control-'+s.data.id,s.data.input.project_id).catch(()=>null);const deliveries=await database().prepare("SELECT id,data,created_at FROM records WHERE project_id=? AND type='production_delivery' AND json_extract(data,'$.batch_id')=? ORDER BY created_at DESC").bind(s.data.input.project_id,s.data.id).all<any>();return {...s,deliveries:deliveries.results.map(r=>({...r,data:JSON.parse(r.data)})),control:c?.data||{enabled:false},usage:budgetUsage(s.data),capability:executorCapability()}}
export async function listProduction(projectId:string){
 await projectExists(projectId);const db=database(),rows=await db.prepare("SELECT revision,data FROM records WHERE project_id=? AND type='production_batch' ORDER BY created_at DESC LIMIT 30").bind(projectId).all<{revision:number;data:string}>();
 if(!rows.results.length)return [];
 const batches=rows.results.map(r=>({revision:r.revision,data:JSON.parse(r.data) as ProductionBatch})),ids=batches.map(b=>b.data.id),placeholders=ids.map(()=>'?').join(',');
 const [controls,deliveries]=await Promise.all([
  db.prepare("SELECT id,data FROM records WHERE project_id=? AND type='production_control' AND id IN ("+placeholders+")").bind(projectId,...ids.map(id=>'control-'+id)).all<any>(),
  db.prepare("SELECT id,data,created_at FROM records WHERE project_id=? AND type='production_delivery' AND json_extract(data,'$.batch_id') IN ("+placeholders+") ORDER BY created_at DESC").bind(projectId,...ids).all<any>()
 ]);
 const controlMap=new Map(controls.results.map(r=>[r.id,JSON.parse(r.data)])),deliveryMap=new Map<string,any[]>();
 for(const row of deliveries.results){const r={...row,data:JSON.parse(row.data)},id=r.data.batch_id,list=deliveryMap.get(id)||[];list.push(r);deliveryMap.set(id,list)}
 return batches.map(b=>({...b,control:controlMap.get('control-'+b.data.id)||{enabled:false},deliveries:deliveryMap.get(b.data.id)||[],usage:budgetUsage(b.data),capability:executorCapability()}));
}
export type ProductionArtifact={version:1;id:string;batch_id:string;slot:string;kind:'image'|'copy'|'observation'|'quality';input_hash:string;workflow_run_id:string;tokens:number|null;elapsed:number|null;created_at:string;asset_id?:string;background_sha256?:string;layout?:LayoutSpec;copy?:{title:string;body:string;platform:string;tags:readonly string[];text:string;added_fields?:{field:string;value:string}[]};observation?:string;quality?:{needs_repair:boolean;findings:{area:string;severity:string;detail:string}[];repair_instruction:string;uncertainty:string};upstream?:{slot:string;sha256:string}[];manual_edit?:{parent_id:string;parent_sha256:string;request_sha256?:string;reason:string;at:string;model_calls:0}};
export async function saveProductionArtifact(b:ProductionBatch,slot:string,run:{id:string;total_tokens?:number|null;elapsed_time?:number|null},content:Partial<ProductionArtifact>){
 const job=b.jobs.find(j=>j.slot===slot)!;const id=b.id+'-'+slot+'-'+job.attempts.at(-1)!.id;
 const value:ProductionArtifact={version:1,id,batch_id:b.id,slot,kind:job.kind==='image'?'image':slot.startsWith('quality-')?'quality':slot.startsWith('vision')?'observation':'copy',input_hash:b.input_hash,workflow_run_id:run.id,tokens:run.total_tokens??null,elapsed:run.elapsed_time??null,created_at:b.created_at,...content};
 const encoded=JSON.stringify(value),hash=await sha256(encoded),key='_private/production-artifact/'+id;
 const existing=await bucket().get(key);if(existing){const bytes=await existing.text();const old=JSON.parse(bytes);if(old.input_hash!==b.input_hash||old.workflow_run_id!==run.id)throw new HttpError(409,'产物归档冲突。');return {id,sha256:await sha256(bytes),input_hash:b.input_hash,workflow_run_id:run.id}}
 await bucket().put(key,encoded,{httpMetadata:{contentType:'application/json'}});return {id,sha256:hash,input_hash:b.input_hash,workflow_run_id:run.id};
}
export async function loadProductionArtifact(projectId:string,batchId:string,slot:string){const b=await readBatch(projectId,batchId),j=b.data.jobs.find(j=>j.slot===slot);if(!j?.artifact)throw new HttpError(404,'产物尚未归档。');const object=await bucket().get('_private/production-artifact/'+j.artifact.id);if(!object)throw new HttpError(404,'产物文件不存在。');const encoded=await object.text();if(await sha256(encoded)!==j.artifact.sha256)throw new HttpError(409,'产物校验失败。');const artifact=JSON.parse(encoded) as ProductionArtifact;if(artifact.kind==='image'){const asset=await record(artifact.asset_id!,projectId),image=await bucket().get(asset.data.storage_key);if(!image||await sha256(await image.arrayBuffer())!==artifact.background_sha256)throw new HttpError(409,'背景原图校验失败，未作为当前审核或交付版本读取。');}if(artifact.layout?.logo){const l=artifact.layout.logo,a=await sharedIP(l.asset_id),o=await bucket().get(a.data.storage_key);if(!o||a.revision!==l.revision||await sha256(await o.arrayBuffer())!==l.sha256)throw new HttpError(409,'批准LOGO版本已改变，请重新确认品牌层。')}return {artifact,job:j,batch:b};}
export {layoutSpec};
