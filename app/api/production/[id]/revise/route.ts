import {checkOrigin,failure} from '@/lib/server';
import {reviseProductionFacts,revisionImpact,visualRevisionImpact,reviseProductionVisual} from '@/lib/production-revision';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(req);const raw:any=await req.json(),id=(await params).id;return Response.json(await (raw.mode==='visual'?reviseProductionVisual(id,raw):reviseProductionFacts(id,raw)),{status:201})}catch(e){return failure(e)}}

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const q=new URL(req.url).searchParams,id=(await params).id;return Response.json(await (q.get('mode')==='visual'?visualRevisionImpact(q.get('project_id')||'',id,q.get('brief_id')||''):revisionImpact(q.get('project_id')||'',id)),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
