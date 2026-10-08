import {checkOrigin,failure,HttpError} from '@/lib/server';
import {savePrintProof} from '@/lib/production-print-proof';
export async function POST(req:Request){try{checkOrigin(req);const f=await req.formData(),file=f.get('file'),project=String(f.get('project_id')||'');if(f.get('consent')!=='true'||!(file instanceof File)||file.size>32*1024*1024)throw new HttpError(400,'请确认归档并上传32MB以内印前包');return Response.json(await savePrintProof(project,new Uint8Array(await file.arrayBuffer())))}catch(e){return failure(e)}}
