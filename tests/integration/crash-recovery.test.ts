import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { JobStore,type Job } from '../../services/research/store.ts';
import { ComputePool } from '../../services/research/pool.ts';
import { JobRunner } from '../../services/research/runner.ts';
import { analyzeResearch } from '../../lib/finance/research.ts';
import { researchFixture } from '../fixtures/research.ts';

const uri=process.env.MONGODB_TEST_URI;
if(!uri)throw new Error('MONGODB_TEST_URI is required; crash recovery uses real MongoDB.');

test('SIGKILL before finalization recovers through competing runners with one durable result',{timeout:20000},async t=>{
  const name=`marketlab_test_${randomUUID().replaceAll('-','')}`;
  const observer=new JobStore(uri,name);await observer.initialize();
  const stores:JobStore[]=[],runners:JobRunner[]=[];
  const snapshot=await researchFixture(),expected=analyzeResearch(snapshot);
  const submitted=await observer.submit('crash-owner',snapshot);
  const child=fork(new URL('../fixtures/crash-runner.ts',import.meta.url),[uri,name],{execArgv:['--experimental-strip-types'],stdio:['ignore','pipe','pipe','ipc']});
  let errors='';child.stderr!.on('data',chunk=>{errors=(errors+chunk).slice(-8000);});
  const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  try{
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`Worker did not reach crash barrier: ${errors}`)),10000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error(`Worker exited before barrier: ${code}/${signal}: ${errors}`));});
      child.on('message',message=>{
        if((message as {type?:string}).type==='calculated-before-finalization'){clearTimeout(timer);resolve();}
      });
    });
    const stale=(await observer.get(submitted.owner,submitted.id))!;
    assert.equal(stale.status,'running');assert.equal(stale.attempts,1);assert.equal(stale.result,undefined);
    assert.equal(child.kill('SIGKILL'),true);assert.equal((await exited).signal,'SIGKILL');
    t.diagnostic('Killed the actual runner process after worker calculation, before MongoDB finalization.');

    let finalizations=0;
    for(let i=0;i<2;i++){
      const store=new JobStore(uri,name);stores.push(store);await store.initialize();
      const complete=store.complete.bind(store);
      store.complete=async(...args)=>{const committed=await complete(...args);if(committed)finalizations++;return committed;};
      runners.push(new JobRunner(store,new ComputePool(1,'cpp-verify'),1000));
    }
    runners.forEach(runner=>runner.start());
    // No manual expiry or requeue: the database lease must naturally expire.
    let saved:Job|null=null;
    for(let tries=0;tries<200;tries++){
      saved=await observer.get(submitted.owner,submitted.id);
      if(saved?.status==='completed'||saved?.status==='failed')break;
      await delay(25);
    }
    assert.ok(saved);assert.equal(saved.status,'completed',errors);assert.equal(saved.attempts,2);
    assert.deepEqual(JSON.parse(saved.result!),expected);assert.equal(saved.verification!.comparisons,9);
    await Promise.all(runners.map(runner=>runner.close()));
    assert.equal(finalizations,1);assert.equal(await observer.jobs.countDocuments({owner:submitted.owner}),1);
    assert.equal(await observer.complete(stale,expected,saved.verification!),false);
    assert.equal(await observer.heartbeat(stale,1000),false);
    await observer.fail(stale,'stale','Must not erase the recovered result.',true);
    await Promise.all(stores.map(store=>store.close()));
    const reopened=new JobStore(uri,name);
    try{
      const persisted=await reopened.get(submitted.owner,submitted.id);
      assert.equal(persisted!.status,'completed');assert.deepEqual(JSON.parse(persisted!.result!),expected);
    }finally{await reopened.close();}
    t.diagnostic('Two replacement runners competed; attempts=2, accepted finalizations=1, stored results=1; fresh connection replay matched exactly.');
  }finally{
    if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');if(child.pid)await exited;}
    await Promise.all(runners.map(runner=>runner.close()));
    await Promise.all(stores.map(store=>store.close()));
    await observer.client.db(name).dropDatabase();await observer.close();
  }
});
