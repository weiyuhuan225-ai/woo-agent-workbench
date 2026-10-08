import {checkOrigin,failure} from '@/lib/server';
import {listShotTasks,submitShotTask} from '@/lib/production-shot';
export async function GET(req:Request){try{const q=new URL(req.url).searchParams;return Response.json({tasks:await listShotTasks(q.get('project_id')||'',q.get('script_id')||undefined)},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{checkOrigin(req);return Response.json(await submitShotTask(await req.json()))}catch(e){return failure(e)}}
