import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { JobStore } from '../../services/research/store.ts';
import { analyzeResearch } from '../../lib/finance/research.ts';
import { researchFixture } from '../fixtures/research.ts';

const uri=process.env.MONGODB_TEST_URI;
if(!uri)throw new Error('MONGODB_TEST_URI is required; lease tests use real MongoDB.');
const verification={engine:'test-reference',comparisons:0,maxAbsoluteError:0};

test('a fast competing host cannot steal a live lease',async t=>{
  const name=`marketlab_test_${randomUUID().replaceAll('-','')}`;
  const first=new JobStore(uri,name),second=new JobStore(uri,name);
  await first.initialize();await second.initialize();
  try{
    const snapshot=await researchFixture();await first.submit('clock-owner',snapshot);
    const original=await first.claim(60000);assert.ok(original);
    t.mock.timers.enable({apis:['Date'],now:Date.now()+3600000});
    const stolen=await second.claim(60000);
    assert.equal(stolen===null,true,'A host one hour ahead must not reclaim an unexpired database lease.');
    t.mock.timers.reset();
    assert.equal((await first.get(original.owner,original.id))!.attempts,1);
    assert.equal(await first.complete(original,analyzeResearch(snapshot),verification),true);
  }finally{
    t.mock.timers.reset();await first.client.db(name).dropDatabase();
    await Promise.all([first.close(),second.close()]);
  }
});

test('skewed claim and heartbeat use database time without extending ownership by an hour',async t=>{
  const name=`marketlab_test_${randomUUID().replaceAll('-','')}`,store=new JobStore(uri,name);
  await store.initialize();
  try{
    await store.submit('clock-owner',await researchFixture());
    const before=Date.now();t.mock.timers.enable({apis:['Date'],now:before+3600000});
    const job=await store.claim(60000);assert.ok(job);
    assert.ok(job.leaseUntil!.getTime()<before+120000,'Claim must not inherit the fast host clock.');
    assert.equal(await store.heartbeat(job,60000),true);
    const renewed=(await store.get(job.owner,job.id))!;
    assert.ok(renewed.leaseUntil!.getTime()<before+120000,'Heartbeat must not inherit the fast host clock.');
  }finally{t.mock.timers.reset();await store.client.db(name).dropDatabase();await store.close();}
});

test('a slow stale host cannot complete, renew or requeue an expired lease',async t=>{
  const name=`marketlab_test_${randomUUID().replaceAll('-','')}`,store=new JobStore(uri,name);
  await store.initialize();
  try{
    const snapshot=await researchFixture();await store.submit('clock-owner',snapshot);
    const stale=await store.claim(60000);assert.ok(stale);
    // Expiry is controlled here to isolate fencing; the process-crash test uses natural expiry.
    await store.jobs.updateOne({id:stale.id},[{$set:{leaseUntil:{$subtract:['$$NOW',1000]}}}]);
    t.mock.timers.enable({apis:['Date'],now:Date.now()-3600000});
    assert.equal(await store.complete(stale,analyzeResearch(snapshot),verification),false);
    assert.equal(await store.heartbeat(stale,60000),false);
    await store.fail(stale,'stale','Must not requeue.',true);
    assert.equal((await store.get(stale.owner,stale.id))!.status,'running');
    const replacement=await store.claim(60000);assert.ok(replacement);
    assert.equal(replacement.attempts,2);assert.notEqual(replacement.leaseToken,stale.leaseToken);
    assert.equal(await store.complete(replacement,analyzeResearch(snapshot),verification),true);
  }finally{t.mock.timers.reset();await store.client.db(name).dropDatabase();await store.close();}
});

test('lease finalization preserves dollar-prefixed error and verification values',async()=>{
  const name=`marketlab_test_${randomUUID().replaceAll('-','')}`,store=new JobStore(uri,name);
  await store.initialize();
  try{
    const snapshot=await researchFixture();await store.submit('literal-owner',snapshot);
    const first=await store.claim(60000);assert.ok(first);
    await store.fail(first,'$worker-error','$$NOW is error text, not a database expression.',true);
    const failed=(await store.get(first.owner,first.id))!;
    assert.equal(failed.errorCode,'$worker-error');
    assert.equal(failed.errorMessage,'$$NOW is error text, not a database expression.');
    const second=await store.claim(60000);assert.ok(second);
    const literalVerification={...verification,engine:'$engine'};
    assert.equal(await store.complete(second,analyzeResearch(snapshot),literalVerification),true);
    assert.deepEqual((await store.get(second.owner,second.id))!.verification,literalVerification);
  }finally{await store.client.db(name).dropDatabase();await store.close();}
});
