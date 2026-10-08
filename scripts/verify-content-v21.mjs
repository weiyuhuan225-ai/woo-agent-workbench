import {build} from 'esbuild';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
await build({entryPoints:['lib/dify-v21.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/tests/content-v21.mjs'});
const {decodeProfessionalOutput}=await import('../.sites-runtime/tests/content-v21.mjs');
for(const key of ['poster','script','graphic','review']){
 const req=JSON.parse(await readFile(`dify/content-v21/${key}-request.json`,'utf8'));
 const raw=JSON.parse(await readFile(`dify/content-v21/${key}-live-case1.json`,'utf8'));
 const decode=x=>decodeProfessionalOutput({content_result:[{result:x}]},req);
 assert.equal(decode(raw).result.status,'awaiting_review');
 assert.throws(()=>decode({...raw,run_id:'wrong'}));
 assert.throws(()=>decode({...raw,source_set:[]}));
 assert.equal(decode({...raw,evidence:[{source_id:req.source_set[0].id,quote:'伪造摘录'}]}).result.status,'needs_clarification');
 assert.equal(decode({...raw,structured_output:{}}).result.status,'needs_clarification');
 const bad=structuredClone(raw);
 if(key==='poster')bad.structured_output.image_asset_ids=['invented-image'];
 if(key==='script')bad.structured_output.script_meta.target_duration+=1;
 if(key==='graphic')bad.structured_output.pages[0].page_no=2;
 if(key==='review')delete bad.structured_output.budget_reconciliation;
 assert.equal(decode(bad).result.status,'needs_clarification');
}
console.log('PASS: 4 recorded live fixtures decoded; identity/source, invented quote, incomplete outputs, image claims, durations and page sequence rejected. Offline replay only.');
