import {bucket,database,HttpError,now,record} from './server';
import {onlineSupplement} from './production-online';
import {readBatch} from './production-store';
import {activityRecord} from './activity-server';
import {briefPreflight,copyChecks} from './production-plan';
import {loadProductionArtifact} from './production-server';
import {validateArtifactDependencies} from './production-edit';
import {sha256} from './production-content';
import {readDeliveryZip} from './production-package';
import {imageDimensions} from './image-dimensions';
import {productionFont,productionFontLicense} from './production-font';
export async function saveProductionDelivery(project:string,batchId:string,bytes:Uint8Array){
 if(bytes.length>32*1024*1024)throw new HttpError(413,'批准包超过32MB归档上限，请减少本次选中项或分别导出。');
 const b=await readBatch(project,batchId),a=await activityRecord(project);if(a?.revision!==b.data.input.activity_revision||!briefPreflight(b.data.input.activity,true).formal_ready)throw new HttpError(409,'活动事实已改变或尚未补足，不能归档正式包。');
 let files:Map<string,Uint8Array>;try{files=readDeliveryZip(bytes)}catch(e){throw new HttpError(400,(e as Error).message)}
 let manifest:any;try{manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')))}catch{throw new HttpError(400,'交付manifest缺失或无效')}
 if(manifest.batch_id!==batchId||manifest.input_hash!==b.data.input_hash||!Array.isArray(manifest.delivery_files)||!manifest.delivery_files.length||manifest.delivery_files.length>8)throw new HttpError(409,'交付包与当前批准输入不一致。');
 const allowed=new Set(['manifest.json']),entries:any[]=[],seen=new Set<string>();
 for(const entry of manifest.delivery_files){const slot=String(entry.name||'').match(/^online\/(poster-[1-4]|copy-(weibo|xiaohongshu|douyin|moments))\.(png|txt)$/)?.[1];if(!slot||seen.has(slot))throw new HttpError(400,'交付槽位无效或重复');seen.add(slot);const loaded=await loadProductionArtifact(project,batchId,slot),artifact=loaded.artifact;
  if(loaded.job.review!=='approved'||loaded.job.artifact!.sha256!==entry.approved_artifact_sha256||artifact.id!==entry.artifact_id)throw new HttpError(409,'交付作品版本未批准或已经改变。');await validateArtifactDependencies(project,batchId,artifact);
  const file=files.get(entry.name);if(!file||await sha256(file)!==entry.sha256)throw new HttpError(409,'交付文件哈希不一致');allowed.add(entry.name);
  if(artifact.layout){const dims=imageDimensions(file);if(dims.width!==artifact.layout.width||dims.height!==artifact.layout.height||entry.name!=='online/'+slot+'.png')throw new HttpError(400,'海报成品尺寸或文件名不正确');const text={title:artifact.layout.headline,body:artifact.layout.details.join('\n')};if(copyChecks(text,b.data.input.activity).length)throw new HttpError(409,'海报固定事实遗漏');const name='layouts/'+slot+'.json',layout=files.get(name);if(!layout||new TextDecoder().decode(layout)!==JSON.stringify(artifact.layout,null,2))throw new HttpError(409,'文字层规格与批准版不同');allowed.add(name);
  }else if(!artifact.copy||entry.name!=='online/'+slot+'.txt'||new TextDecoder().decode(file)!==artifact.copy.text||copyChecks(artifact.copy,b.data.input.activity).length)throw new HttpError(409,'正文与批准版本不同。');
  entries.push({slot,artifact_id:artifact.id,approved_artifact_sha256:entry.approved_artifact_sha256,name:entry.name,sha256:entry.sha256});
 }
 if(manifest.supplement){const current=await onlineSupplement(project,b.data);if(JSON.stringify(manifest.supplement)!==JSON.stringify(current))throw new HttpError(409,'视频审批、采购或发布建议版本已变化，请重新导出');for(const [name,value] of [['online/publishing-plan.json',current.publishing_plan],['online/material-list.json',current.material_list]] as const){if(new TextDecoder().decode(files.get(name))!==JSON.stringify(value,null,2))throw new HttpError(409,'交付建议或物料清单不一致');allowed.add(name)}if(current.video.id){for(const info of current.video.outputs){const name=info.mime==='video/mp4'?'online/video.mp4':'online/cover.jpg',file=files.get(name);if(!file||await sha256(file)!==info.sha256)throw new HttpError(409,'批准视频或封面缺失或哈希不同');allowed.add(name)}}}
 if(files.has('fonts/WOO-CJKsc-Regular.otf')){if(await sha256(files.get('fonts/WOO-CJKsc-Regular.otf')!)!==productionFont.sha256)throw new HttpError(409,'交付字体哈希不正确');const license=files.get('fonts/OFL-NotoSansCJK.txt');if(!license||await sha256(license)!==productionFontLicense.sha256)throw new HttpError(409,'字体授权文件缺失或改变');allowed.add('fonts/WOO-CJKsc-Regular.otf');allowed.add('fonts/OFL-NotoSansCJK.txt')}
 if([...files.keys()].some(name=>!allowed.has(name)))throw new HttpError(400,'交付包包含清单以外的文件');
 const hash=await sha256(bytes),id='production-delivery-'+hash,storage_key='_private/production-delivery/'+id,t=now(),data={batch_id:batchId,input_hash:b.data.input_hash,activity_revision:b.data.input.activity_revision,artifacts:entries,partial:entries.length<8,sha256:hash,size:bytes.length,storage_key,filename:batchId+'-approved.zip',renderer:manifest.renderer,supplement:manifest.supplement||null,complete_online_package:entries.length===8&&!!manifest.supplement?.video?.id,exported_at:t};
 // The INSERT checks activity/project versions after private file storage; conflicts never publish a receipt.
 await bucket().put(storage_key,bytes,{httpMetadata:{contentType:'application/zip'}});const old=await record(id,project).catch(()=>null);if(old){if(old.data.sha256!==hash||old.data.batch_id!==batchId)throw new HttpError(409,'归档编号冲突');return old}
 const result=await database().prepare("INSERT OR IGNORE INTO records SELECT ?,?,'production_delivery',?,1,?,? WHERE EXISTS (SELECT 1 FROM records WHERE id=? AND project_id=? AND revision=?) AND EXISTS (SELECT 1 FROM records WHERE project_id=? AND type='activity_settings' AND revision=?)").bind(id,project,JSON.stringify(data),t,t,batchId,project,b.revision,project,a!.revision).run();if(!result.meta.changes)throw new HttpError(409,'归档时活动或审批版本改变，请重新核对当前包。');return {id,revision:1,data,created_at:t};
}
export async function listProductionDeliveries(project:string,batchId:string){await readBatch(project,batchId);const r=await database().prepare("SELECT id,revision,data,created_at FROM records WHERE project_id=? AND type='production_delivery' AND json_extract(data,'$.batch_id')=? ORDER BY created_at DESC").bind(project,batchId).all<any>();return r.results.map(x=>({...x,data:JSON.parse(x.data)}))}
export async function readProductionDelivery(project:string,batchId:string,id:string){const r=await record(id,project);if(r.type!=='production_delivery'||r.data.batch_id!==batchId)throw new HttpError(404,'归档包不存在');const object=await bucket().get(r.data.storage_key);if(!object)throw new HttpError(404,'归档文件不存在');const bytes=await object.arrayBuffer();if(await sha256(bytes)!==r.data.sha256)throw new HttpError(409,'归档包哈希校验失败');return new Response(bytes,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+r.data.filename+'"','Cache-Control':'no-store'}})}
