import {z} from 'zod';
import {checkOrigin,failure} from '@/lib/server';
import {queryShotTask} from '@/lib/production-shot';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await queryShotTask(new URL(req.url).searchParams.get('project_id')||'',(await params).id),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(req);const r=z.object({project_id:z.string().min(1),workflow_run_id:z.string().uuid(),consent:z.literal(true)}).strict().parse(await req.json());return Response.json(await queryShotTask(r.project_id,(await params).id,r.workflow_run_id))}catch(e){return failure(e)}}
