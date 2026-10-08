import {z} from 'zod';
import {record,database,checkOrigin,failure,now,HttpError} from '@/lib/server';
const input=z.object({project_id:z.string().min(1),revision:z.number().int().positive(),decision:z.enum(['approved','rejected']),note:z.string().trim().min(5).max(2000)});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{
 checkOrigin(req);const b=input.parse(await req.json()),r=await record((await params).id,b.project_id);
 if(r.type!=='asset')throw new HttpError(400,'请选择素材文件。');
 if(r.revision!==b.revision)throw new HttpError(409,'素材已更新，请刷新后审核。');
 const t=now(),data={...r.data,review_status:b.decision,review_history:[...(r.data.review_history||[]),{decision:b.decision,note:b.note,at:t,source_revision:r.revision,actor:'workspace-owner'}]};
 const changed=await database().prepare('UPDATE records SET data=?,revision=revision+1,updated_at=? WHERE id=? AND project_id=? AND revision=?').bind(JSON.stringify(data),t,r.id,r.project_id,b.revision).run();
 if(!changed.meta.changes)throw new HttpError(409,'素材已更新，请刷新后审核。');return Response.json({id:r.id,review_status:b.decision});
 }catch(e){return failure(e)}}
