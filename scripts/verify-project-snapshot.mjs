import {build} from 'esbuild';import assert from 'node:assert/strict';
await build({entryPoints:['lib/project-snapshot.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/tests/project-snapshot.mjs'});
const {buildProjectSnapshot}=await import('../.sites-runtime/tests/project-snapshot.mjs');
const p={id:'woo-original',revision:3,updated_at:'2026-10-04T09:00:00Z'};
const records=[{id:'task1',type:'task',revision:2,data:JSON.stringify({title:'人工新增',status:'todo',due:'',source:'手动录入'})},{id:'budget1',type:'budget',revision:4,data:{title:'物料',quantity:2,unit_price:30,actual_amount:null,status:'unverified'}},{id:'config',type:'agent',data:{key:'secret-must-not-appear'}},{id:'file',type:'asset',data:{notes:'private asset body must not appear'}}];
const s=buildProjectSnapshot(p,records,true,[{run_id:'approved-1',workflow_run_id:'workflow-1',reviewed_at:'2026-10-04T09:00:00Z'}]);
assert.equal(s.source_set[0].type,'closeout');assert.equal(s.source_set[0].date,null);assert.equal(s.budgets[0].actual_amount,null);assert.equal(s.tasks[0].status,'todo');assert.equal(s.tasks[0].revision,2);assert.equal(s.approved_upstream_ids[0],'approved-1');assert.equal(s.source_set[2].confidence,'approved');assert(!JSON.stringify(s).includes('secret-must-not-appear'));assert(!JSON.stringify(s).includes('private asset body'));assert.equal(buildProjectSnapshot(p,[],false).source_set.length,1);
console.log('PASS: final-closeout priority, unknown source date, null actual spend, persisted revisions, approved-source lineage, private config and asset-body exclusion.');
