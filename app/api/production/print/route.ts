import {checkOrigin,failure,record} from '@/lib/server';
import {savePrintContract} from '@/lib/production-offline';
export async function GET(req:Request){try{const q=new URL(req.url).searchParams,p=q.get('project_id')||'',id='print-'+(q.get('batch_id')||'')+'-'+(q.get('slot')||'');const r=await record(id,p).catch(()=>null);return Response.json(r?{id:r.id,revision:r.revision,data:r.data}:{revision:0,data:null},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{checkOrigin(req);return Response.json(await savePrintContract(await req.json()))}catch(e){return failure(e)}}
