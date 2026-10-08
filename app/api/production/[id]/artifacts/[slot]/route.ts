import {failure,checkOrigin} from '@/lib/server';
import {loadProductionArtifact} from '@/lib/production-server';
import {artifactHistory,editProductionArtifact,validateArtifactDependencies} from '@/lib/production-edit';
import {batchView} from '@/lib/production-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;slot:string}>}){try{const p=await params,project=new URL(req.url).searchParams.get('project_id')||'',r=await loadProductionArtifact(project,p.id,p.slot);let dependency_warning='';try{await validateArtifactDependencies(project,p.id,r.artifact)}catch(e){dependency_warning=(e as Error).message}return Response.json({artifact:r.artifact,review:r.job.review,sha256:r.job.artifact!.sha256,history:new URL(req.url).searchParams.get('history')==='0'?[]:await artifactHistory(project,p.id,p.slot,r),dependency_warning},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string;slot:string}>}){try{checkOrigin(req);const p=await params;return Response.json(await batchView(await editProductionArtifact(p.id,p.slot,await req.json())))}catch(e){return failure(e)}}
