import {failure} from '@/lib/server';
import {offlinePreparation} from '@/lib/production-offline';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return Response.json(await offlinePreparation(new URL(req.url).searchParams.get('project_id')||'',(await params).id),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
