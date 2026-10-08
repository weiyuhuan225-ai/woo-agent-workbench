import {ensureUnifiedTasks} from './unified-tasks';
import {database,HttpError,record} from '@/lib/server';
import {executionSchema} from '@/lib/project-execution';
export async function validateExecutionTask(project:string,id:string,lane?:'online'|'offline'){if(!id)return;await ensureUnifiedTasks(project);const raw=await database().prepare("SELECT * FROM records WHERE id=? AND project_id=? AND type='task'").bind(id,project).first<any>();const r=raw?{...raw,data:JSON.parse(raw.data)}:null;if(!r||r.data.archived||(lane&&r.data.lane!==lane))throw new HttpError(400,'任务已不存在或不属于当前工作区，请返回项目重新选择');}
export async function sharedIP(id:string){const a=await record(id);if(a.type!=='asset'||a.data.category!=='IP与视觉'||!['image/png','image/jpeg'].includes(a.data.mime)||!a.data.storage_key||a.data.size>8*1024*1024||((a.data.generated||a.id.startsWith('generated-')||a.id.startsWith('layout-'))&&a.data.review_status!=='approved'))throw new HttpError(400,'请选择共享资产池中已批准、8MB以内的IP图片');return a}
