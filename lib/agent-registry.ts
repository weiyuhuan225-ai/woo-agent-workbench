export const phaseNames={not_started:'未开始',connected:'已连接',functional:'可运行',validated:'已验证',accepted:'已验收'};
const liveNodes=['统一输入','旧契约节点（输出未使用）','DeepSeek 专业生成','结构与来源校验','待人工审核输出'];
export const agentRegistry=[
 {key:'research',name:'校园调研',id:'00000000-0000-4000-8000-000000000101',live:false,test:'公开模板未连接模型；需在自己的 Dify 工作区配置、测试和人工验收。',nodes:liveNodes},
 {key:'strategy',name:'策略策划',id:'00000000-0000-4000-8000-000000000102',live:false,test:'公开模板未连接模型；需在自己的 Dify 工作区配置、测试和人工验收。',nodes:liveNodes},
 {key:'topic',name:'选题策划',id:'00000000-0000-4000-8000-000000000103',live:false,test:'公开模板未连接模型；需在自己的 Dify 工作区配置、测试和人工验收。',nodes:liveNodes},
 ...[{key:'poster',name:'节庆海报'},{key:'script',name:'视频脚本'},{key:'graphic',name:'图文设计'},{key:'review',name:'项目复盘'}].map(x=>({...x,id:'00000000-0000-4000-8000-000000000104',live:false,test:'公开模板未连接模型；需在自己的 Dify 工作区配置、测试和人工验收。',nodes:['完整来源与任务请求','四专业能力路由：'+x.name,'DeepSeek 专业生成','专业产物聚合','结构与来源校验','待人工审核输出']}))
];
