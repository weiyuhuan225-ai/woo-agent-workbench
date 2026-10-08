import {z} from 'zod';
import {checkOrigin,failure} from '@/lib/server';
import {listApprovedMemory,saveApprovedMemory,revokeApprovedMemory} from '@/lib/production-brand';
export async function GET(req:Request){try{return Response.json({memories:await listApprovedMemory(new URL(req.url).searchParams.get('project_id')||'')},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{checkOrigin(req);return Response.json(await saveApprovedMemory(await req.json()))}catch(e){return failure(e)}}
export async function PATCH(req:Request){try{checkOrigin(req);const r=z.object({project_id:z.string(),id:z.string(),revision:z.number().int().positive(),reason:z.string().min(5).max(1000),consent:z.literal(true)}).strict().parse(await req.json());return Response.json(await revokeApprovedMemory(r.project_id,r.id,r.revision,r.reason))}catch(e){return failure(e)}}
