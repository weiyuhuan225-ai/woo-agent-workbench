import {validateActivity} from '@/lib/activity-server';
import {z} from 'zod';
import {validateExecutionTask} from '@/lib/execution-server';
import {copyInput,copyInstruction} from '@/lib/copywriting';
import {checkOrigin,database,bucket,record,now,HttpError,failure} from '@/lib/server';
import {configured,runDify} from '@/lib/dify';
import {buildProfessionalRequest} from '@/lib/dify-v21';
import {buildProjectSnapshot} from '@/lib/project-snapshot';
import {describeDifyImage} from '@/lib/dify-vision';
import {streamJson} from '@/lib/stream-json';
import {completedCopy,updateCopyRecord} from '@/lib/copywriting-recovery';
import {DifyRunError} from '@/lib/dify-run-transport';
async function imageDescription(id:string,project:string,request_id:string){
 const a=await record(id,project);
 if(a.type!=='asset'||!['image/png','image/jpeg'].includes(a.data.mime)||!a.data.storage_key||a.data.size>8*1024*1024)throw new HttpError(400,'请选择8MB以内的 PNG / JPEG 图片。');
 const object=await bucket().get(a.data.storage_key);if(!object)throw new HttpError(404,'图片已删除，请重新上传。');
 const bytes=new Uint8Array(await object.arrayBuffer());
 const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value),jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(bytes.length>8*1024*1024||!(a.data.mime==='image/png'&&png||a.data.mime==='image/jpeg'&&jpeg))throw new HttpError(400,'图片内容不是有效的 PNG / JPEG。');
 let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return describeDifyImage({project_id:project,request_id,image_data:'data:'+a.data.mime+';base64,'+btoa(raw)});
}
async function generate(req:Request){let id='',projectId='',reserved=false;try{checkOrigin(req);if(Number(req.headers.get('content-length')||0)>20000)throw new HttpError(413,'活动信息过长。');const b=copyInput.parse(await req.json()),db=database();projectId=b.project_id;await validateExecutionTask(b.project_id,b.execution_task_id,'online');await validateActivity(b.project_id,b.activity_revision);const project=await db.prepare('SELECT * FROM projects WHERE id=?').bind(b.project_id).first<any>();if(!project)throw new HttpError(404,'项目不存在。');const fingerprint=JSON.stringify(b);id='copy-'+b.request_id;const old=await db.prepare('SELECT * FROM records WHERE id=?').bind(id).first<any>();if(old){const d=JSON.parse(old.data);if(old.project_id!==b.project_id||d.fingerprint!==fingerprint)throw new HttpError(409,'请求标识冲突。');id='';return Response.json({id:old.id,...d},{status:d.status==='running'?202:200})}if(project.revision!==b.project_revision)throw new HttpError(409,'项目已更新，请刷新。');if(!configured())throw new HttpError(503,'Dify 尚未配置。');if(b.platform==='douyin')await record(b.image_id,b.project_id);const data={input:b,fingerprint,status:'submitting',review_status:'awaiting_review',project_revision:project.revision};const t=now();const inserted=await db.prepare("INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,'copywriting',?,1,?,?)").bind(id,b.project_id,JSON.stringify(data),t,t).run();if(!inserted.meta.changes){id='';throw new HttpError(409,'本次请求已提交，请打开历史记录。')}
reserved=true;const vision=b.platform==='douyin'?await imageDescription(b.image_id,b.project_id,b.request_id):null;
if(vision)await updateCopyRecord(id,b.project_id,current=>({...current,vision}));
// Only this event is sent as the creative source: historical closeout figures are not new event facts.
const current={...project,brief:'当前活动资料：'+JSON.stringify(b),goal:'根据用户本次活动资料生成平台文案',source_note:'本次填写资料；图片观察属于模型识别结果，需要核对。'};
const snapshot=buildProjectSnapshot(current,[],false);const instruction=copyInstruction(b,vision?.text||'');const request=buildProfessionalRequest('graphic',b.request_id,current,snapshot,JSON.stringify({activity:b,image_observations:vision?.text||''}),'',[],instruction);
await updateCopyRecord(id,b.project_id,current=>({...current,dify_request:request,stage:'copy_submitting'}));
const output=await runDify('graphic',JSON.stringify(request),'能力类型：graphic\n本次任务：'+instruction,b.project_id,request,async identity=>{
 await updateCopyRecord(id,b.project_id,current=>{
  if(current.workflow_run_id&&current.workflow_run_id!==identity.workflow_run_id)throw new HttpError(409,'运行编号冲突，未覆盖。');
  return {...current,...identity,status:'running',stage:'copy_running'};
 });
});
const final=await updateCopyRecord(id,b.project_id,current=>completedCopy(current,output));
return Response.json({id,...final});
}catch(e){if(id&&reserved){await updateCopyRecord(id,projectId,current=>({...current,status:e instanceof DifyRunError&&e.certainty==='confirmed_failure'?'failed':'unknown',error:e instanceof Error?e.message:'结果待核对，请查询原任务。'})).catch(()=>{});}
if(e instanceof HttpError||e instanceof z.ZodError)return failure(e);return Response.json({error:e instanceof Error?e.message:'文案生成失败，请查看原任务。'},{status:502})}}
export async function POST(req:Request){return req.headers.get('X-WOO-Stream')==='1'?streamJson(()=>generate(req)):generate(req)}
