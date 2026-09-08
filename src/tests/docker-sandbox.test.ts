import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DockerSandboxAdapter } from '../sandbox/adapter.js';

test('docker sandbox refuses restricted network', () => {
  assert.throws(() => new DockerSandboxAdapter().create({ id: 'r', root: mkdtempSync(join(tmpdir(),'ds-')), network: 'restricted' }), /restricted/);
});

test('docker sandbox executes with network none when daemon/image available', async () => {
  const h = new DockerSandboxAdapter().create({ id: 'n', root: mkdtempSync(join(tmpdir(),'ds-')), network: 'none' });
  const r = await h.run('node', ['-e', "require('fs').writeFileSync('/workspace/ok','1'); process.stdout.write(process.cwd())"]);
  assert.equal(r.code, 0); assert.match(r.stdout, /workspace/); await h.dispose();
});

test('real docker enforces configured output bounds',async()=>{
  const h=new DockerSandboxAdapter().create({id:'bounded',root:mkdtempSync(join(tmpdir(),'ds-')),network:'none',maxOutputBytes:128});
  try {await assert.rejects(h.run('node',['-e',"process.stdout.write('x'.repeat(4096))"]),/output limit/);}finally{await h.dispose()}
});

test('real docker applies OS restrictions and resource limits',async()=>{
  const h=new DockerSandboxAdapter().create({id:'isolation',root:mkdtempSync(join(tmpdir(),'ds-')),network:'none',memoryMb:128,cpus:0.5,pidsLimit:32});
  try {
    const r=await h.run('node',['-e',`const fs=require('fs'),os=require('os');
      let readonly=false;try{fs.writeFileSync('/forbidden','x')}catch(e){readonly=e.code==='EROFS'}
      console.log(JSON.stringify({readonly,interfaces:Object.keys(os.networkInterfaces()),
      memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),cpu:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim(),pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(),status:fs.readFileSync('/proc/self/status','utf8')}));`]);
    assert.equal(r.code,0,r.stderr);const value=JSON.parse(r.stdout);
    assert.equal(value.readonly,true);assert.deepEqual(value.interfaces,['lo']);
    assert.equal(value.memory,'134217728');assert.equal(value.cpu,'50000 100000');assert.equal(value.pids,'32');
    assert.match(value.status,/CapEff:\s+0000000000000000/);assert.match(value.status,/NoNewPrivs:\s+1/);
  }finally{await h.dispose()}
});

test('real docker timeout and cancellation clean up owned containers',async()=>{
  const h=new DockerSandboxAdapter().create({id:'timeout',root:mkdtempSync(join(tmpdir(),'ds-')),network:'none',timeoutMs:1500});
  try {
    await assert.rejects(h.run('node',['-e','setInterval(()=>{},1000)']),/timeout/);
    const controller=new AbortController();const running=h.run('node',['-e','setInterval(()=>{},1000)'],{signal:controller.signal});
    setTimeout(()=>controller.abort(),800);await assert.rejects(running,/cancelled/);
  }finally{await h.dispose()}
  await assert.rejects(h.run('node',['-v']),/disposed/);
});
