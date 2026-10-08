import {z} from 'zod';
import {copyTags,copyPlatforms} from './copywriting';
const text=z.string().trim().min(1).max(1200);
export const writingPolicySchema=z.object({version:z.string().min(1).max(100),tags:z.array(z.enum(copyTags)).max(3).refine(v=>new Set(v).size===v.length,'tag不可重复'),rules:z.object({weibo:text,xiaohongshu:text,douyin:text,moments:text}).strict()}).strict();
export type WritingPolicy=z.infer<typeof writingPolicySchema>;
export const defaultWritingPolicy:WritingPolicy={version:'writing-rules-1',tags:[...copyTags],rules:{weibo:'开场钩子、活动要点和互动引导；段落简洁。',xiaohongshu:'标题清楚、短段落自然分享；体验性描述必须有依据。',douyin:'配文简洁，围绕单图可见主体和氛围；不编造前后镜头。',moments:'自然分享、活动信息和行动指引；减少广告腔。'}};
export const directionSchema=z.object({id:z.string().min(1).max(200),origin:z.enum(['reference_template','approved_topic','manual']),title:z.string().trim().min(1).max(150),goal:text,audience:text,hook:text,visual:text,resources:z.array(text).min(1).max(20),topic_run_id:z.string().max(200).optional()}).strict();
export type ProductionDirection=z.infer<typeof directionSchema>;
export const planningSchema=z.object({direction:directionSchema,research:z.object({decision:z.enum(['skip','reuse']),reason:z.string().trim().min(5).max(1000),source_ids:z.array(z.string().min(1).max(200)).max(30)}).strict()}).strict();
export type ProductionPlanning=z.infer<typeof planningSchema>;
/** Reference patterns contain no invented activity facts and make no model request. */
export function referenceDirections(event:string):ProductionDirection[]{const name=event||'本次活动';return [
 {id:'participate',origin:'reference_template',title:name+' · 接住这一棒',goal:'活动认知与参与意愿',audience:'本次活动目标校园人群（需核对）',hook:'接力邀请',visual:'Woo虎发出接力邀请，品牌黄红色，四种不同构图',resources:['批准Woo虎参考图','已确认活动事实','报名或咨询入口（如适用）']},
 {id:'energy',origin:'reference_template',title:name+' · 校园能量集合',goal:'建立活动主题与品牌记忆',audience:'本次活动目标校园人群（需核对）',hook:'校园活力与品牌角色',visual:'Woo虎与抽象校园运动元素，同主题不同画面',resources:['批准品牌资产','已确认活动信息','校园场景仅作创意背景']},
 {id:'guide',origin:'reference_template',title:name+' · 一起加入',goal:'让参与方式清楚可执行',audience:'准备了解或参加本次活动的人群',hook:'清晰信息与行动引导',visual:'干净主视觉，留足活动事实与CTA文字区',resources:['活动时间地点','已批准行动引导','联系方式或二维码入口（如适用）']}
]}
const sourceText=(value:unknown,fallback:string)=>typeof value==='string'&&value.trim()?value:value==null?fallback:JSON.stringify(value)||fallback;
export function approvedTopicDirections(items:any[],revision:number):ProductionDirection[]{return items.filter(i=>i.type==='run'&&i.data.key==='topic'&&i.data.review_status==='approved'&&i.data.v2_output?.execution_mode==='live'&&i.data.project_revision===revision).flatMap(i=>(i.data.v2_output?.structured_output?.topics||[]).filter((v:any)=>v?.topic_id&&v?.title).map((v:any)=>({id:String(v.topic_id),origin:'approved_topic' as const,topic_run_id:i.id,title:String(v.title).slice(0,150),goal:sourceText(v.outline?.goal||i.data.v2_output.structured_output.strategy_link,'批准选题的传播目标').slice(0,1200),audience:String(v.audience||'校园目标人群').slice(0,1200),hook:String(v.outline?.hook||v.reason||v.brand_reason||v.title).slice(0,1200),visual:sourceText(v.outline?.visual||v.outline,v.title).slice(0,1200),resources:(Array.isArray(v.assets)?v.assets:[v.assets]).filter(Boolean).map((x:any)=>typeof x==='string'?x:JSON.stringify(x)).slice(0,20)})).filter((v:ProductionDirection)=>v.resources.length))}
export function briefPreflight(activity:any,brand:boolean){const critical=[['event_name','活动名称'],['time','活动时间'],['place','活动地点']].filter(([k])=>!String(activity?.[k]||'').trim()).map(([,label])=>label);return {critical,draft_allowed:!!activity?.event_name&&brand,formal_ready:critical.length===0&&brand,warnings:[...(!brand?['批准品牌参考图尚未选择']:[]),...(!activity?.contact?['联系方式未填写；如需要咨询或报名，请补足']:[]),...(!activity?.mandatory?['必留文字未设置；请核对是否需要']:[])]}}
export function copyChecks(copy:{title:string;body:string},activity:any){const combined=copy.title+'\n'+copy.body;return ['mandatory','time','place','contact'].filter(k=>activity[k]&&!combined.includes(activity[k])).map(k=>({field:k,value:activity[k]}))}
export {copyPlatforms};
