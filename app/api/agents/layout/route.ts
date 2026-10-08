import {z} from 'zod';
import {record,database,bucket,checkOrigin,failure,now,HttpError} from '@/lib/server';
import {outputSchema} from '@/lib/v2-contract';
import {layoutPages,layoutSvg} from '@/lib/layout-preview';
const input=z.object({project_id:z.string().min(1),run_id:z.string().min(1),page:z.number().int().min(1).max(100)});
export async function POST(req:Request){let storageKey='';try{
 checkOrigin(req);const b=input.parse(await req.json()),r=await record(b.run_id,b.project_id);
 if(r.type!=='run'||r.data.review_status!=='approved')throw new HttpError(409,'请先人工批准文字工作稿。');
 const output=outputSchema.parse(r.data.v2_output);
 if(output.execution_mode!=='live'||output.validation_errors.length)throw new HttpError(409,'此结果不能作为排版依据。');
 const page=layoutPages(output)[b.page-1];if(!page)throw new HttpError(400,'预览页不存在。');
 const id='layout-'+b.run_id+'-'+b.page,existing=await database().prepare('SELECT id FROM records WHERE id=? AND project_id=?').bind(id,b.project_id).first();
 if(existing)return Response.json({id});
 const svg=layoutSvg(page),t=now();storageKey=b.project_id+'/'+id;
 await bucket().put(storageKey,svg,{httpMetadata:{contentType:'image/svg+xml'}});
 const data={title:output.title+' · 第'+b.page+'页文字排版',category:'图片',origin:'执行资料',notes:'基于已批准文字生成的SVG工作稿；尚未补齐图片、IP与二维码，非送印或发布文件。',filename:id+'.svg',mime:'image/svg+xml',size:new TextEncoder().encode(svg).length,storage_key:storageKey,generated:true,review_status:'awaiting_review',source_run_id:r.id,source_version:r.revision,page:b.page};
 await database().prepare('INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,?, ?,1,?,?)').bind(id,b.project_id,'asset',JSON.stringify(data),t,t).run();return Response.json({id},{status:201});
 }catch(e){if(storageKey)try{await bucket().delete(storageKey)}catch{}return failure(e)}}
