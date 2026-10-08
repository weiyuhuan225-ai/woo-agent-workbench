import {build} from 'esbuild';
import assert from 'node:assert/strict';
await build({entryPoints:['lib/dify-run-transport.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/tests/dify-run-transport.mjs'});
const m=await import('../.sites-runtime/tests/dify-run-transport.mjs');
const id=crypto.randomUUID(),other=crypto.randomUUID();let calls=0,persisted=[];
const start={event:'workflow_started',workflow_run_id:id,data:{id}},end={event:'workflow_finished',workflow_run_id:id,data:{id,status:'succeeded',outputs:{text:'中文'}}};
function response(events,split=1){const bytes=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join(''));return new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=split)c.enqueue(bytes.slice(i,i+split));c.close()}}),{headers:{'Content-Type':'text/event-stream'}})}
globalThis.fetch=async()=>{calls++;return response([start,end])};
let r=await m.streamDifyRun('synthetic',{brief:'test'},'test',async x=>{persisted.push(x.workflow_run_id)});
assert.equal(r.outputs.text,'中文');assert.deepEqual(persisted,[id]);assert.equal(calls,1);
// Missing workflow_started: recover the ID from later documented event envelopes.
persisted=[];globalThis.fetch=async()=>response([{event:'node_started',workflow_run_id:id,data:{id:'node-id'}},end],13);
await m.streamDifyRun('synthetic',{},'test',async x=>persisted.push(x.workflow_run_id));assert.deepEqual(persisted,[id]);
globalThis.fetch=async()=>response([start]);
await assert.rejects(()=>m.streamDifyRun('synthetic',{},'test',async()=>{}),e=>e.certainty==='unknown'&&e.workflow_run_id===id);
globalThis.fetch=async()=>response([start,{...end,workflow_run_id:other}]);
await assert.rejects(()=>m.streamDifyRun('synthetic',{},'test',async()=>{}),e=>e.certainty==='unknown');
let starts=0;globalThis.fetch=async()=>{starts++;return response([start,end])};
await assert.rejects(()=>m.streamDifyRun('synthetic',{},'test',async()=>{throw Error('DB unavailable')}));assert.equal(starts,1);
globalThis.fetch=async()=>new Response('sensitive-upstream-value',{status:502});
await assert.rejects(()=>m.streamDifyRun('synthetic',{},'test',async()=>{}),e=>e.certainty==='unknown'&&!e.message.includes('sensitive-upstream-value'));
for(const status of ['running','paused','partial-succeeded','failed','stopped','succeeded']){
 globalThis.fetch=async(u,o)=>{assert.equal(u,`https://api.dify.ai/v1/workflows/run/${id}`);assert(!o.method||o.method==='GET');return Response.json({id,status,outputs:{}})};
 assert.equal((await m.getDifyRun('synthetic',id)).status,status);
}
globalThis.fetch=async()=>Response.json({id:other,status:'succeeded',outputs:{}});
await assert.rejects(()=>m.getDifyRun('synthetic',id));
console.log('PASS: split UTF-8/CRLF SSE; fallback run identity; durable-ID callback failure; disconnect; mismatched run; sanitized HTTP errors; GET-only six-state query. No real model calls.');
