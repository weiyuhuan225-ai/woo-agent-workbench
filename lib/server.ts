import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { seedProject,seedRecords } from './seed';
import {closeoutText} from './closeout';
import {closeoutRecords,closeoutBrief,closeoutSource} from './closeout-baseline';
export function database(){if(!env.DB)throw new Error('数据库暂不可用');return env.DB}
export function bucket(){if(!env.BUCKET)throw new Error('文件存储暂不可用');return env.BUCKET}
export const now=()=>new Date().toISOString();
const initialized=new WeakMap<object,Promise<void>>();
/** Seed once per database binding in a warm isolate; failed initialization can retry. */
export function initialize(){const db=database(),current=initialized.get(db);if(current)return current;const attempt=initializeDatabase();initialized.set(db,attempt);attempt.catch(()=>{if(initialized.get(db)===attempt)initialized.delete(db)});return attempt}
async function initializeDatabase(){
 const db=database();if(await db.prepare('SELECT id FROM projects WHERE id=?').bind(seedProject.id).first()){await ensureCloseout();await ensureCloseoutBaseline();return;}
 const p=seedProject,t=now();
 await db.batch([
 db.prepare('INSERT OR IGNORE INTO projects (id,name,brand,school,goal,brief,source_note,reference_budget,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)').bind(p.id,p.name,p.brand,p.school,p.goal,p.brief,p.source_note,p.reference_budget,t,t),
 ...seedRecords.map(r=>db.prepare('INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(r.id,p.id,r.type,JSON.stringify(r.data),t,t))]);
 await ensureCloseout();await ensureCloseoutBaseline();
}
export function checkOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new HttpError(403,'请求来源不匹配，请刷新页面后重试。')}
export class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
export function failure(e:unknown){if(e instanceof HttpError)return Response.json({error:e.message},{status:e.status});if(e instanceof z.ZodError)return Response.json({error:'请检查必填内容、日期和金额。',details:e.issues.map(i=>i.path.join('.'))},{status:400});console.error('workbench error',e);return Response.json({error:'暂时无法保存或读取，请稍后重试。已填写内容会保留。'},{status:503})}
const str=z.string().max(10000);const short=z.string().trim().max(300);const title=z.string().trim().min(1).max(200);
const source=short.default('手动录入');const date=z.string().refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))),'日期不正确');
export const schemas={
 task:z.object({change_reason:z.string().trim().max(2000).optional(),owner_id:short.optional(),channel:short.optional(),deliverable_ids:z.array(short).max(100).optional(),archived:z.boolean().optional(),title,lane:z.enum(['online','offline']),phase:z.enum(['调研','预热','爆发','延热','复盘']),status:z.enum(['unverified','todo','doing','review','ready','done']),owner:short,due:date,notes:str,source}),
 content:z.object({title,kind:z.enum(['topic','poster','live_script','ai_script','graphic','research','strategy','review']),channel:short,task_id:short,status:z.enum(['idea','draft','review','ready','published']),body:z.string().max(50000),source}),
 budget:z.object({title,category:short.min(1),quantity:z.number().finite().min(0).max(1000000),unit:short.min(1),unit_price:z.number().finite().min(0).max(10000000),shipping:z.number().finite().min(0).max(10000000),actual_amount:z.number().finite().min(0).max(100000000).nullable(),spec:short,status:z.enum(['unverified','confirmed','ordered','received']),notes:str,source}),
 agent:z.object({key:z.enum(['research','strategy','topic','poster','script','graphic','review']),provider:short,workflow_id:short,notes:str}),
 asset:z.object({title,category:short,origin:z.enum(['原始策划','执行资料','结案资料','其他']),notes:str})
};
export const projectSchema=z.object({name:title,brand:short,school:short,goal:short,brief:str,source_note:str,reference_budget:z.number().int().min(0).max(10000000000).nullable()});
export async function projectExists(id:string){if(!await database().prepare('SELECT id FROM projects WHERE id=?').bind(id).first())throw new HttpError(404,'项目不存在。')}
export async function record(id:string,projectId?:string){const r=await database().prepare('SELECT * FROM records WHERE id=?').bind(id).first<any>();if(!r||(projectId&&r.project_id!==projectId))throw new HttpError(404,'记录不存在。');return {...r,data:JSON.parse(r.data)}}
export async function linkedTask(data:any,projectId:string){if(data.task_id){const r=await record(data.task_id,projectId);if(r.type!=='task')throw new HttpError(400,'请选择当前项目中的执行任务。')}}

async function ensureCloseout(){const t=now();await database().prepare("INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES ('a-closeout','woo-original','asset',?,1,?,?)").bind(JSON.stringify({title:'公开合成结案样本',category:'结案资料',origin:'结案资料',notes:closeoutText,reference_url:'/reference/demo-closeout.html',size:0}),t,t).run()}

async function ensureCloseoutBaseline(){
 const db=database(),marker='system-closeout-baseline-v1';
 if(await db.prepare('SELECT id FROM records WHERE id=?').bind(marker).first())return;
 const t=now();
 await db.batch([
 ...closeoutRecords.map(r=>db.prepare('INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,?,?,1,?,?)').bind(r.id,'woo-original',r.type,JSON.stringify(r.data),t,t)),
 db.prepare('UPDATE projects SET brief=?,source_note=?,revision=revision+1,updated_at=? WHERE id=? AND brief=? AND source_note=?').bind(closeoutBrief,closeoutSource,t,'woo-original',seedProject.brief,seedProject.source_note),
 db.prepare("INSERT OR IGNORE INTO records (id,project_id,type,data,revision,created_at,updated_at) VALUES (?,?,'system','{}',1,?,?)").bind(marker,'woo-original',t,t)
 ]);
}
