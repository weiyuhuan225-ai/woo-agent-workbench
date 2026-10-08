import {database,record} from './server';
import type {ProductionBatch} from './production-batch';
import {listVideoRenders} from './production-render';
import {approvedVideoScript,videoPreparation} from './production-video';
import {copyPlatforms} from './copywriting';
export async function onlineSupplement(project:string,b:ProductionBatch){
 let video:any=null;for(const r of await listVideoRenders(project)){if(r.data.status!=='archived'||r.data.review_status!=='approved'||r.data.activity_revision!==b.input.activity_revision||r.data.project_revision!==b.input.project_revision)continue;try{await videoPreparation(project,r.data.script_id);const s=await approvedVideoScript(project,r.data.script_id),p=await record('video-plan-'+r.data.script_id,project);if(s.hash===r.data.script_hash&&p.revision===r.data.plan_revision){video={id:r.id,revision:r.revision,script_id:r.data.script_id,script_hash:r.data.script_hash,plan_revision:r.data.plan_revision,outputs:r.data.outputs.map(({storage_key,...x}:any)=>x)};break}}catch{}}
 const rows=await database().prepare("SELECT id,revision,data FROM records WHERE project_id=? AND type IN ('procurement','material') ORDER BY id").bind(project).all<any>(),materials=rows.results.map(r=>({...r,data:JSON.parse(r.data)}));
 const publishing_plan={version:'publish-plan-1',status:'suggested_pending_human_schedule',activity:b.input.activity,channels:Object.entries(copyPlatforms).map(([key,name])=>({channel:key,name,copy_slot:'copy-'+key,phase:'活动预热与报名引导',timing:'活动前由负责人确认日期与时段',owner:'待分工确认',poster:'从已批准四稿中选择适合版式',video:video?'批准成片及封面可选':'成片待补',evidence:'发布后登记真实链接和时间'})),notice:'仅为发布建议，不代表排期已批准或内容已发布；不得自动发布。'};
 return {schema_version:1,video:video||{status:'blocked',reason:'尚无当前事实与镜头版本的人工批准完整成片和封面'},publishing_plan,material_list:{project_id:project,activity_revision:b.input.activity_revision,records:materials,notice:'数量和实付以人工确认的采购及执行记录为准；未知金额不计作零'}};
}
