import {z} from 'zod';
export const agentKeys=['research','strategy','topic','poster','script','graphic','review'] as const;
export const resultSchema=z.object({schema_version:z.literal('2.0'),agent_key:z.enum(agentKeys),status:z.enum(['awaiting_review','needs_clarification']),title:z.string().min(1).max(200),body:z.string().max(40000),evidence:z.array(z.string().max(1000)).max(30),warnings:z.array(z.string().max(1000)).max(30),to_confirm:z.array(z.string().max(1000)).max(30),review_notes:z.array(z.string().max(1000)).max(30)});
export type AgentResult=z.infer<typeof resultSchema>;
export const agentBriefs:Record<string,string>={
 research:'输出研究问题、已知事实与来源、受众假设、竞品对比维度、信息缺口、可执行调研步骤。未配置搜索工具，不可声称已检索实时热点或新增来源。',
 strategy:'输出目标与受众、品牌关联、核心策略、线上线下活动机制、执行阶段、人员分工、资源与预算假设、风险、衡量口径及10页PPT大纲。预算只做待询价清单，不伪造采购价格。',
 topic:'默认3个差异化选题，各含标题、渠道、受众洞察、品牌关联、具体提纲、CTA、素材、执行步骤、指标口径和事实依据。',
 poster:'输出节庆海报完整设计稿说明：主副标题、正文、CTA、节庆日期核对、构图、色彩、字体层级、品牌/IP一致性、尺寸、安全区、二维码留位、生图正负提示词及印前核对。输出为设计说明和提示词，不是假装生成图片。',
 script:'分别输出真人拍摄与AIGC脚本。每条分镜包含时码、景别、画面、动作、台词/字幕、声音、转场、素材；合计时长自洽。真人部分含设备人员与拍摄清单；AIGC部分含每镜提示词、角色一致性和后期拼接要求。不声称已生成视频。',
 graphic:'输出目标平台、封面标题、逐页图文文案与配图说明、正文、CTA、标签建议、排版和品牌一致性检查。默认5页，逐页区分事实与创意。输出内容稿，不声称已排版成图。',
 review:'以计划/执行/证据/差异/原因假设/下一步对照表复盘。核对加总、去重、播放/曝光/人数口径及预算/实际/收入关系。没有来源的结论标假设，不把团队成绩归功于个人。输出可复用经验与结案PPT大纲。'
};
