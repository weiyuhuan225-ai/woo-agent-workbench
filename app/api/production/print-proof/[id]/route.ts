import {failure} from '@/lib/server';
import {readPrintProof} from '@/lib/production-print-proof';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const q=new URL(req.url).searchParams;return await readPrintProof(q.get('project_id')||'',(await params).id,q.get('file')||'zip')}catch(e){return failure(e)}}
