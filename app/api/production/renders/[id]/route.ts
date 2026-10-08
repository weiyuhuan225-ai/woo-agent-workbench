import {z} from 'zod';
import {checkOrigin,failure} from '@/lib/server';
import {queryVideoRender,reviewVideoRender,renderOutput} from '@/lib/production-render';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const q=new URL(req.url).searchParams,id=(await params).id;return q.has('file')?await renderOutput(q.get('project_id')||'',id,q.get('file')||'video'):Response.json(await queryVideoRender(q.get('project_id')||'',id),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(req);const v=z.object({project_id:z.string().min(1),revision:z.number().int().positive(),hash:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approved','rejected']),consent:z.literal(true)}).strict().parse(await req.json());return Response.json(await reviewVideoRender(v.project_id,(await params).id,v.revision,v.hash,v.decision))}catch(e){return failure(e)}}
