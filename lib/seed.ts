/** Fictional public demo only; no historical campaign data. */
export const seedProject={id:'woo-original',name:'WOO 校园创作演示',brand:'演示品牌',school:'示例大学',goal:'演示线上内容与线下执行协同',brief:'虚构场景：策划一场校园文创展示，制作海报、四平台文案和视频脚本。全部日期、费用与成果为演示数据，不代表实际活动。',source_note:'公开演示种子，未包含原始项目文件。',reference_budget:100000};
export const seedRecords:any[]=[
{id:'t-social',type:'task',data:{title:'准备四平台文案',lane:'online',phase:'预热',status:'todo',owner:'',due:'',notes:'确认事实后生成，人工审核后使用。',source:'公开演示'}},
{id:'t-sport',type:'task',data:{title:'准备线下展示区',lane:'offline',phase:'爆发',status:'todo',owner:'',due:'',notes:'确认尺寸、人员与借用资源。',source:'公开演示'}},
{id:'b-main',type:'budget',data:{title:'演示展板',category:'场地搭建',quantity:1,unit:'块',unit_price:100,shipping:0,actual_amount:null,spec:'演示规格，正式尺寸待确认',status:'unverified',notes:'合成报价，不代表供应商实际报价。',source:'公开演示'}},
{id:'a-original',type:'asset',data:{title:'演示策划说明',category:'策划方案',origin:'原始策划',notes:'合成案例，供流程演示。',reference_url:'/reference/demo-plan.html',size:0}}
];
