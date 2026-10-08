export type Project={id:string;name:string;brand:string;school:string;goal:string;brief:string;source_note:string;reference_budget:number|null;revision:number;created_at:string;updated_at:string};
export type Item={id:string;project_id:string;type:'task'|'content'|'budget'|'asset'|'agent'|'run'|'media'|'poster_batch'|'copywriting'|'material'|'procurement'|'member'|'execution_plan'|'activity_settings'|'content_brief'|'production_batch'|'production_control'|'print_contract'|'outcome'|'execution_evidence'|'video_plan'|'production_delivery'|'brand_profile'|'approved_memory'|'video_render'|'video_shot_task'|'print_proof';data:Record<string,any>;revision:number;created_at:string;updated_at:string};
export const agents=[
 {key:'research',name:'校园调研',desc:'整理校园信息、热点与来源',icon:'Search'},
 {key:'strategy',name:'策略策划',desc:'从品牌简报到活动方案',icon:'Compass'},
 {key:'topic',name:'选题策划',desc:'把节点与品牌策略变成选题',icon:'Lightbulb'},
 {key:'poster',name:'节庆海报',desc:'输出海报文案、设计说明与提示词',icon:'Image'},
 {key:'script',name:'视频脚本',desc:'真人拍摄与 AIGC 双轨脚本',icon:'Clapperboard'},
 {key:'graphic',name:'图文设计',desc:'整理图文结构与平台表达',icon:'Layout'},
 {key:'review',name:'项目复盘',desc:'对照计划与实际，分析差异',icon:'Chart'}
];
export const taskStatuses:Record<string,string>={unverified:'待核对',todo:'待开始',doing:'进行中',review:'待验收',ready:'已核对',done:'已完成'};
export const contentStatuses:Record<string,string>={idea:'待策划',draft:'制作中',review:'待审核',ready:'待发布',published:'已发布'};
export const contentKinds:Record<string,string>={topic:'选题',poster:'节庆海报',live_script:'真人脚本',ai_script:'AIGC 脚本',graphic:'图文',research:'调研报告',strategy:'策略方案',review:'项目复盘'};
export const assetCategories=['品牌与调研','策划方案','IP与视觉','物料与预算','内容成品','执行记录','结案资料'];
export function plannedCents(d:Record<string,any>){return Math.round(Number(d.quantity)*Number(d.unit_price)*100)+Math.round(Number(d.shipping||0)*100)}
export const money=(n:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2}).format(n);
