import {failure} from '@/lib/server';
import {videoPreparation} from '@/lib/production-video';
export async function GET(req:Request){try{const q=new URL(req.url).searchParams;return Response.json(await videoPreparation(q.get('project_id')||'',q.get('script_id')||'',q.get('edit')==='1'),{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
