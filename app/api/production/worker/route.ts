import {z} from 'zod';
import {database,HttpError,now} from '@/lib/server';
import {executorAuthorization,executorCapability} from '@/lib/production-server';
import {productionWorkTick} from '@/lib/production-worker';
async function handle(req:Request){
 try{await executorAuthorization(req);const body=req.method==='GET'?{mode:'probe'}:await req.json(),b=z.object({mode:z.enum(['probe','execute']),probe_id:z.string().uuid().optional()}).strict().parse(body);
 if(b.mode==='probe'){const id=b.probe_id||crypto.randomUUID(),t=now(),project=await database().prepare('SELECT id FROM projects ORDER BY created_at ASC LIMIT 1').first<{id:string}>();if(!project)throw new HttpError(409,'先建立一个项目再验证后台持久写入。');await database().prepare("INSERT OR IGNORE INTO records VALUES (?,?,'executor_probe',?,1,?,?)").bind('executor-probe-'+id,project.id,JSON.stringify({id,at:t,source:'authorized_service_request',model_calls:0}),t,t).run();return Response.json({ok:true,probe_id:id,model_calls:0,capability:executorCapability()})}
 if(!executorCapability().enabled)throw new HttpError(409,'后台生产尚未启用。');return Response.json(await productionWorkTick());
 }catch(e){return Response.json({error:e instanceof HttpError?e.message:'执行器本次未完成；保留原任务并在下一次唤醒核对。'},{status:e instanceof HttpError?e.status:503})}
}
export const GET=handle;export const POST=handle;
