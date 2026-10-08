import {build} from 'esbuild';
import assert from 'node:assert/strict';
await build({entryPoints:['lib/stream-json.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/tests/stream-json.mjs'});
const {streamJson}=await import('../.sites-runtime/tests/stream-json.mjs');
let complete;const r=streamJson(()=>new Promise(resolve=>complete=resolve));const reader=r.body.getReader();assert.equal(new TextDecoder().decode((await reader.read()).value),'\n');assert.equal(new TextDecoder().decode((await reader.read()).value),'\n');complete(Response.json({id:'task',status:'succeeded'},{status:201}));let text='';while(true){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value)}assert.equal(JSON.parse(text)._http_status,201);
const error=await streamJson(async()=>Response.json({error:'Invalid project'},{status:404})).json();assert.equal(error._http_status,404);
const thrown=await streamJson(async()=>{throw new Error('private provider detail')}).json();assert.equal(thrown._http_status,503);assert(!JSON.stringify(thrown).includes('private provider detail'));
let end;const cancelled=streamJson(()=>new Promise(resolve=>end=resolve));await cancelled.body.cancel();end(Response.json({status:'succeeded'}));await Promise.resolve();
console.log('PASS: immediate JSON heartbeat, periodic heartbeat, original status, sanitized failure, safe cancellation.');
