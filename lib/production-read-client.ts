import type {ProductionArtifact} from './production-server';
export type ArchivedArtifactRead={artifact:ProductionArtifact;review:string;sha256:string;history:any[];dependency_warning:string};
// Only simultaneous GETs share a promise. Nothing is cached after it settles;
// edits, dependencies and the approval version are always checked again.
const pending=new Map<string,Promise<ArchivedArtifactRead>>();
export function readArchivedArtifact(project:string,batch:string,slot:string,hash:string,revision:number,history=false){
 const key=JSON.stringify([project,batch,slot,hash,revision,history]);const current=pending.get(key);if(current)return current;
 const request=(async()=>{const r=await fetch('/api/production/'+batch+'/artifacts/'+slot+'?'+new URLSearchParams({project_id:project,...(!history?{history:'0'}:{})}),{signal:AbortSignal.timeout(30000)}),d:any=await r.json();if(!r.ok)throw Error(d.error||'读取作品失败');if(d.sha256!==hash)throw Error('产物版本已变化，请刷新后再核对。');return d as ArchivedArtifactRead})();
 pending.set(key,request);request.then(()=>pending.delete(key),()=>pending.delete(key));return request;
}
