import {build} from 'esbuild';
import assert from 'node:assert/strict';
await build({entryPoints:['lib/copywriting.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/tests/copywriting.mjs'});
const {copyInput,copyTags,copyText,decodeCopy,copyInstruction,completeCopy}=await import('../.sites-runtime/tests/copywriting.mjs');
assert.deepEqual(copyTags,['示例大学接力队','Woo 虎！ 接住这一棒','乐虎接力能量不停']);
const b={project_id:'p',project_revision:1,request_id:'d250bffb-0e51-4226-9ef0-ae52a37a1325',platform:'weibo',event:'接力活动',tone:'青春活力',tags:[copyTags[2],copyTags[0],copyTags[0]]};
const x=copyInput.parse(b);assert.deepEqual(x.tags,[copyTags[0],copyTags[2]]);assert(!copyText(x.platform,'标题','正文',x.tags).includes(copyTags[1]));assert(copyText('weibo','','正文',[copyTags[1]]).includes('#Woo 虎！ 接住这一棒#'));
assert(!copyInput.safeParse({...b,tags:['陌生tag']}).success);assert(!copyInput.safeParse({...b,platform:'douyin'}).success);assert(copyInput.safeParse({...b,platform:'douyin',image_id:'image'}).success);
assert.equal(decodeCopy(JSON.stringify({title:'标题',body:'正文\n#'+copyTags[0]+'#'}),'').body,'正文');assert.throws(()=>decodeCopy({body:''},''));
for(const platform of ['weibo','xiaohongshu','douyin','moments']){const prompt=copyInstruction(copyInput.parse({...b,platform,image_id:platform==='douyin'?'image':''}),'看见一只黄色老虎');assert(prompt.includes('历史项目'));assert(prompt.includes('publish_copy'));assert(prompt.includes('画面'))}
assert.equal(completeCopy({title:'标题',body:'正文'},{required_text:'原样标点！',time:'2026年10月18日 15:00',location:'测试区',contact:'测试联系人'}).body,'正文\n\n原样标点！\n\n时间：2026年10月18日 15:00\n地点：测试区\n联系：测试联系人');assert.equal(completeCopy({title:'标题',body:'已有测试区'},{required_text:'',time:'',location:'测试区',contact:''}).body,'已有测试区');
console.log('PASS: four platform contracts, exact tags and selection order, required Douyin image, publish text extraction, no historical fact autofill.');
