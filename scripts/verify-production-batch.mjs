import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';

// Real SQLite persistence and CAS; no model/provider/network operations.
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,revision INTEGER);CREATE TABLE records(id TEXT PRIMARY KEY,project_id TEXT,type TEXT,data TEXT,revision INTEGER,created_at TEXT,updated_at TEXT);INSERT INTO projects VALUES ("test",1),("other",1)'.replaceAll('"',"'"));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}});
globalThis.productionEnv={DB:{prepare:sql=>wrap(sql)}};
const plugin={name:'env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.productionEnv;',loader:'js'}))}};
await build({stdin:{contents:"export * from './lib/production-batch'; export * from './lib/production-store';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',plugins:[plugin],outfile:'.sites-runtime/tests/production.mjs'});
const m=await import('../.sites-runtime/tests/production.mjs');
const input={project_id:'test',request_id:crypto.randomUUID(),project_revision:1,activity_revision:0,
 activity:{event_name:'合成活动',time:'测试时间',place:'测试地点',contact:'',mandatory:'测试必留文字'},
 approved_brief:{id:'brief-test',revision:1,theme:'接力',cta:'参加',style:'品牌风格',source_ids:['synthetic:test']},
 brand:{id:'brand-test',revision:1,asset_ids:[]},budget:{text:4,image:5,video_seconds:0},media_concurrency:1,workflow_version:'orchestrator-15'};
let batch=await m.newBatch(input);assert.equal(batch.jobs.length,8);
assert.equal(batch.input_hash,await m.inputHash({...batch.input,budget:{video_seconds:0,image:5,text:4}}));
let stored=await m.createBatch(batch);assert.equal(stored.revision,1);assert.equal((await m.createBatch(batch)).revision,1);
await assert.rejects(()=>m.createBatch({...batch,input_hash:'changed'}),e=>e.status===409);
await assert.rejects(()=>m.readBatch('other',batch.id),e=>e.status===404);
const stale=await m.newBatch({...input,request_id:crypto.randomUUID(),project_revision:2});await assert.rejects(()=>m.createBatch(stale),e=>e.status===409);
const write=(fn,rev=stored.revision)=>m.mutateBatch('test',batch.id,rev,fn);
const contenders=await Promise.allSettled([write(b=>m.claimJob(b,'poster-1','a',0)),write(b=>m.claimJob(b,'poster-1','b',0))]);
assert.equal(contenders.filter(r=>r.status==='fulfilled').length,1);assert.equal(contenders.filter(r=>r.status==='rejected').length,1);
stored=await m.readBatch('test',batch.id);const attempt=stored.data.jobs[0].attempts[0].id;
assert.equal(m.budgetUsage(stored.data).reserved.image,1);
await assert.rejects(()=>write(b=>m.claimJob(b,'poster-2','c',0)),e=>e.status===409);
// Expiry before submitting is safely released; the old worker cannot then submit.
stored=await write(b=>m.recoverExpired(b,60001));assert.equal(m.budgetUsage(stored.data).reserved.image,0);
await assert.rejects(()=>write(b=>m.beginSubmission(b,'poster-1',attempt,60001)),e=>e.status===409);
stored=await write(b=>m.claimJob(b,'poster-1','attempt-2',60002));stored=await write(b=>m.beginSubmission(b,'poster-1','attempt-2',60003));
stored=await write(b=>m.recoverExpired(b,120003));assert.equal(stored.data.jobs[0].state,'unknown');assert.equal(m.budgetUsage(stored.data).reserved.image,1);
await assert.rejects(()=>write(b=>m.retryJob(b,'poster-1')),e=>e.status===409);
await assert.rejects(()=>write(b=>m.cancelQueuedJob(b,'poster-1')),e=>e.status===409);
// A delayed response may bind the original run; it may never replace it with a new run.
stored=await write(b=>m.attachRemote(b,'poster-1','attempt-2','remote-original'));
await assert.rejects(()=>write(b=>m.attachRemote(b,'poster-1','attempt-2','remote-different')),e=>e.status===409);
const artifact={id:'artifact-test',sha256:'a'.repeat(64),input_hash:batch.input_hash,workflow_run_id:'remote-original'};
await assert.rejects(()=>write(b=>m.finishJob(b,'poster-1','attempt-2',{status:'succeeded',artifact:{...artifact,input_hash:'wrong'}})),e=>e.status===409);
stored=await write(b=>m.finishJob(b,'poster-1','attempt-2',{status:'succeeded',artifact}));
assert.equal(m.budgetUsage(stored.data).spent.image,1);assert.equal(m.exportableArtifacts(stored.data).length,0);
stored=await write(b=>m.reviewArtifact(b,'poster-1',artifact.sha256,'approved'));assert.equal(m.exportableArtifacts(stored.data).length,1);
await assert.rejects(()=>write(b=>m.retryJob(b,'poster-1')),e=>e.status===409);
await assert.rejects(()=>write(b=>m.reviewArtifact(b,'poster-1','outdated-hash','approved')),e=>e.status===409);
const successSnapshot=JSON.stringify(stored.data.jobs[0]);
// Failed slots alone are retried; each confirmed call consumes allowance even on failure.
for(let i=0;i<4;i++){
 stored=await write(b=>m.claimJob(b,'poster-2',`retry-${i}`,200000+i));
 stored=await write(b=>m.beginSubmission(b,'poster-2',`retry-${i}`,200001+i));
 stored=await write(b=>m.attachRemote(b,'poster-2',`retry-${i}`,`remote-${i}`));
 stored=await write(b=>m.finishJob(b,'poster-2',`retry-${i}`,{status:'failed',workflow_run_id:`remote-${i}`,reason:'synthetic confirmed failure'}));
 stored=await write(b=>m.retryJob(b,'poster-2'));
}
assert.equal(JSON.stringify(stored.data.jobs[0]),successSnapshot);
await assert.rejects(()=>write(b=>m.claimJob(b,'poster-2','over-budget',300000)),e=>e.status===409);
assert.equal(m.budgetUsage(stored.data).spent.image,5);assert.equal(m.budgetUsage(stored.data).currency_actual,null);
// Snapshot mutation and stale revisions are blocked without changing the record.
const before=JSON.stringify(stored);
await assert.rejects(()=>write(b=>({...b,input:{...b.input,activity:{...b.input.activity,time:'unconfirmed update'}}})),e=>e.status===409);
await assert.rejects(()=>write(b=>m.claimJob(b,'copy-weibo','old',0),1),e=>e.status===409);
assert.equal(JSON.stringify(await m.readBatch('test',batch.id)),before);
console.log('PASS: real SQLite replay/CAS/isolation; immutable snapshots; single claimant; pre-submit lease recovery; uncertain submission retained; original run binding; partial retry; budget cap; hash-specific review. No provider calls.');
db.close();
