import {readdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const ignore=new Set(['.git','node_modules','dist','.sites-runtime','.wrangler','.next','.vinext']);
const patterns=[/gh[pousr]_[A-Za-z0-9]{20,}/,/github_pat_[A-Za-z0-9_]{30,}/,/sk-[A-Za-z0-9_-]{24,}/,/appgprj_[a-f0-9]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
let count=0;const issues=[];
async function walk(dir='.'){
 for(const e of await readdir(dir,{withFileTypes:true})){
  if(ignore.has(e.name))continue;const p=dir+'/'+e.name;
  if(e.isDirectory()){await walk(p);continue}
  if(p.endsWith('verify-public-release.mjs')||p.includes('/docs/v3/evidence/'))continue;
  if(!/\.(?:ts|tsx|js|mjs|mts|py|json|ya?ml|md|txt|html)$/.test(p))continue;
  const s=await readFile(p,'utf8');count++;if(patterns.some(r=>r.test(s)))issues.push(p);
 }
}
await walk();assert.deepEqual(issues,[],'Private identifiers or credential patterns found in release files');
const hosting=JSON.parse(await readFile('.openai/hosting.json','utf8'));assert.equal(hosting.project_id,undefined);
const env=await readFile('.env.example','utf8');assert.ok(!/^DIFY_WORKFLOW_API_KEY=.+$/m.test(env));assert.ok(!/^WOO_DIFY_WORKFLOW_ID=.+$/m.test(env));
const ip=JSON.parse(await readFile('lib/woo-ip-reference.json','utf8'));assert.ok(Buffer.from(ip.base64,'base64').length<10000,'Original embedded campaign artwork must not be included');
const lock=JSON.parse(await readFile('package-lock.json','utf8')),pkg=JSON.parse(await readFile('package.json','utf8'));assert.equal(lock.packages[''].name,pkg.name);assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies);
console.log(`PASS: ${count} public text files scanned; no production Site binding, populated model key or original embedded artwork; package lock root consistent.`);
