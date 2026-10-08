import type {Item} from './model';
export const closeoutPolicy='最终执行资料优先于初始计划；冲突保留待核对；合成演示不作真实成果。';
export const closeoutBrief='公开演示案例：校园文创展示。实际场次、传播、费用均为合成演示，不证明生产系统效果。';
export const closeoutSource='公开合成样本，无真实团队数据或原始资料。';
export const closeoutEvents=[{id:'demo',title:'演示文创展示',date:'日期待确认',place:'示例活动区',detail:'用于展示执行资料优先于初案。全部内容为合成样本。',count:'未知',page:1}];
export const closeoutRecords=[{id:'closeout-demo',type:'task',data:{title:'演示归档任务',lane:'offline',phase:'复盘',status:'done',owner:'演示成员',due:'',notes:'合成任务，仅展示状态。',source:'公开演示'}}];
const originalTaskIds=new Set(['t-sport','t-music','t-sugar','t-charity','t-social','t-community','t-ugc','t-message']);
export function isEarlyConcept(item:Item){return !!item.data.archived||(originalTaskIds.has(item.id)||item.id.startsWith('c-'))&&item.revision===1&&String(item.data.source||'').startsWith('原始策划案')}
