import {failure} from '@/lib/server';
import {readProductionDelivery} from '@/lib/production-delivery';
export async function GET(req:Request,{params}:{params:Promise<{id:string;delivery_id:string}>}){try{const p=await params;return await readProductionDelivery(new URL(req.url).searchParams.get('project_id')||'',p.id,p.delivery_id)}catch(e){return failure(e)}}
