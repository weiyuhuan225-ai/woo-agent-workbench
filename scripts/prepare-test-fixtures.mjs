import {mkdir,copyFile,writeFile} from 'node:fs/promises';
await mkdir('docs/v3/evidence',{recursive:true});await mkdir('.sites-runtime/tests',{recursive:true});
await mkdir('.sites-runtime/render-verification/worker-data/public-fixture',{recursive:true});
await copyFile('tests/fixtures/sample.jpg','.sites-runtime/tests/print-small-synthetic.jpg');
await copyFile('tests/fixtures/sample.jpg','.sites-runtime/render-verification/worker-data/public-fixture/cover.jpg');
await writeFile('docs/v3/evidence/render-worker-local-synthetic.json',JSON.stringify({synthetic:true,first:{id:'public-fixture'},notice:'Fixture only; no FFmpeg execution is claimed by this interface test.'}));
