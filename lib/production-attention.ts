import {briefPreflight} from './production-plan';
import {emptyExecution,preparedQuantity} from './project-execution';
import type {Item} from './model';
import type {ProductionBatch} from './production-batch';
export type ProductionAttention={id:string;title:string;target:'activity'|'brief'|'batch'|'materials'|'team'|'video';batch_id?:string};
export function productionAttention(items:Item[],batches:ProductionBatch[],brandAvailable:boolean):ProductionAttention[]{
 const activity=items.find(i=>i.type==='activity_settings'),p=briefPreflight(activity?.data,brandAvailable),list:ProductionAttention[]=p.critical.map(title=>({id:'missing-'+title,title:'待补：'+title,target:'activity'}));if(!brandAvailable)list.push({id:'brand',title:'待选择批准品牌参考图',target:'brief'});
 for(const b of batches){if(b.input.activity_revision!==activity?.revision){list.push({id:b.id+'-stale',title:b.input.approved_brief.theme+'：活动事实已更新，旧稿待核对',target:'batch',batch_id:b.id});continue}
  for(const j of b.jobs){if(j.state==='unknown'||j.state==='failed'||j.state==='succeeded'&&j.review==='pending'&&/^(poster-[1-4]|copy-|vision-)/.test(j.slot))list.push({id:b.id+j.slot,title:b.input.approved_brief.theme+' · '+j.slot+'：'+(j.state==='unknown'?'结果待核对':j.state==='failed'?'原运行已失败':'待审核'),target:'batch',batch_id:b.id});if(j.slot.startsWith('poster')&&j.review==='approved'){const contract=items.find(i=>i.id==='print-'+b.id+'-'+j.slot);if(!contract||contract.data.artifact_hash!==j.artifact?.sha256||contract.data.check?.status!=='ready_for_human_prepress')list.push({id:b.id+j.slot+'-print',title:j.slot+'：线下规格或原生像素待核准',target:'batch',batch_id:b.id})}}
 }
 const plan=items.find(i=>i.type==='execution_plan')?.data||emptyExecution,bill=items.find(i=>i.type==='procurement');for(const l of bill?.data.lines||[]){const q=preparedQuantity(plan as any,l);if(q<l.quantity)list.push({id:'material-'+l.material_id,title:l.title+'：'+q+'/'+l.quantity+' '+l.unit+' 已到位',target:'materials'})}
 for(const a of plan.assignments||[])if(!a.confirmed)list.push({id:'member-'+a.member_id,title:a.name+'：本次分工待确认',target:'team'});
 const scripts=items.filter(i=>i.type==='run'&&i.data.key==='script'&&i.data.review_status==='approved'&&i.data.activity_revision===activity?.revision);for(const s of scripts)list.push({id:'video-'+s.id,title:(s.data.result?.title||'30秒视频')+'：镜头资源与持久合成待核准',target:'video'});
 return list;
}
