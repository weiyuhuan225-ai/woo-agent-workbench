import {database,HttpError,now} from './server';
import {BatchConflict,type ProductionBatch} from './production-batch';

export type StoredBatch={revision:number;data:ProductionBatch};
/** Uses existing records; no applied migrations changed. Internal only until the executor is verified. */
export async function readBatch(projectId:string,id:string):Promise<StoredBatch>{
 const row=await database().prepare("SELECT revision,data FROM records WHERE id=? AND project_id=? AND type='production_batch'").bind(id,projectId).first<{revision:number;data:string}>();
 if(!row)throw new HttpError(404,'生产批次不存在。');
 return {revision:row.revision,data:JSON.parse(row.data)};
}
export async function createBatch(batch:ProductionBatch):Promise<StoredBatch>{
 const t=now(),db=database();
 await db.prepare("INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) SELECT ?,?,'production_batch',?,1,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND revision=?) AND COALESCE((SELECT revision FROM records WHERE project_id=? AND type='activity_settings'),0)=?")
 .bind(batch.id,batch.input.project_id,JSON.stringify(batch),t,t,batch.input.project_id,batch.input.project_revision,batch.input.project_id,batch.input.activity_revision).run();
 let stored:StoredBatch;
 try{stored=await readBatch(batch.input.project_id,batch.id)}catch(e){if(e instanceof HttpError&&e.status===404)throw new HttpError(409,'项目或活动版本已改变，请重新确认本批内容。');throw e}
 if(stored.data.input_hash!==batch.input_hash)throw new HttpError(409,'该请求编号已用于另一份输入，不可覆盖。');
 return stored;
}
/** All transitions and budget reservations share one CAS write. No network calls in mutate. */
export async function mutateBatch(projectId:string,id:string,expectedRevision:number,mutate:(batch:ProductionBatch)=>ProductionBatch):Promise<StoredBatch>{
 const stored=await readBatch(projectId,id);
 if(stored.revision!==expectedRevision)throw new HttpError(409,'生产批次已被其他执行器更新，请重新读取。');
 let next:ProductionBatch;
 try{next=mutate(structuredClone(stored.data))}catch(e){if(e instanceof BatchConflict)throw new HttpError(409,e.message);throw e}
 if(next.id!==id||next.input_hash!==stored.data.input_hash||JSON.stringify(next.input)!==JSON.stringify(stored.data.input))throw new HttpError(409,'批次输入快照不可修改，请创建新批次。');
 const result=await database().prepare("UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND type='production_batch' AND revision=?")
 .bind(JSON.stringify(next),now(),id,projectId,expectedRevision).run();
 if(result.meta.changes!==1)throw new HttpError(409,'生产批次更新冲突，本次未取得执行权。');
 return {revision:expectedRevision+1,data:next};
}
