import {z} from 'zod';
import {checkOrigin,failure,HttpError,record} from '@/lib/server';
import {recoverCopywriting} from '@/lib/copywriting-recovery';
import {queryStoredDifyRun} from '@/lib/dify';
/** Read-only diagnostics against an existing owned record; never accepts arbitrary run IDs. */
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const project=new URL(req.url).searchParams.get('project_id');
  if(!project)throw new HttpError(400,'缺少项目。');
  const row=await record((await params).id,project);
  if(row.type!=='copywriting'||!row.data.workflow_run_id)throw new HttpError(404,'这条记录没有已保存的文案运行编号。');
  const run=await queryStoredDifyRun(row.data.workflow_run_id);
  return Response.json({workflow_run_id:run.id,status:run.status,tokens:run.total_tokens,elapsed:run.elapsed_time});
 }catch(e){if(e instanceof HttpError)return failure(e);return Response.json({error:e instanceof Error?e.message:'原任务查询失败。'},{status:502})}
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  checkOrigin(req);
  const {project_id}=z.object({project_id:z.string().min(1).max(100)}).strict().parse(await req.json());
  const {id}=await params;const data=await recoverCopywriting(id,project_id);
  return Response.json({id,...data});
 }catch(e){if(e instanceof HttpError||e instanceof z.ZodError)return failure(e);return Response.json({error:e instanceof Error?e.message:'查询原任务失败，请稍后再试。'},{status:502})}
}
