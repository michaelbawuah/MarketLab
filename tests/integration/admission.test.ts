import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { AddressInfo } from 'node:net';
import { JobStore,ServiceError,type Job } from '../../services/research/store.ts';
import { createResearchService } from '../../services/research/server.ts';
import { signResearchRequest } from '../../lib/research-signing.ts';
import { researchFixture } from '../fixtures/research.ts';
import { analyzeResearch,researchFingerprint } from '../../lib/finance/research.ts';
const uri=process.env.MONGODB_TEST_URI!;
if(!uri)throw new Error('Authenticated MONGODB_TEST_URI required.');
const name=()=>`marketlab_test_${randomUUID().replaceAll('-','')}`;
const active={status:{$in:['queued','running'] as Job['status'][]}};
const legacy={$jsonSchema:{bsonType:'object',required:['owner','id','slot','status','snapshot','attempts'],properties:{owner:{bsonType:'string',minLength:1,maxLength:128},id:{bsonType:'string',pattern:'^[a-f0-9]{64}$'},slot:{bsonType:'int',minimum:0,maximum:29},status:{enum:['queued','running','completed','failed']},snapshot:{bsonType:'string'},attempts:{bsonType:'int',minimum:0,maximum:3}}}};
test('atomic active admission across connections rejects excess without partial jobs and replays at capacity',async()=>{
  const database=name(),stores=Array.from({length:3},()=>new JobStore(uri,database,'',{global:6,perOwner:2}));
  await Promise.all(stores.map(s=>s.initialize()));
  try{
    const fixture=await researchFixture();
    const owner=await Promise.allSettled(Array.from({length:20},(_,i)=>stores[i%3].submit('one',{...fixture,config:{...fixture.config,name:`Owner ${i}`}})));
    assert.equal(owner.filter(r=>r.status==='fulfilled').length,2);
    for(const r of owner)if(r.status==='rejected'){assert.ok(r.reason instanceof ServiceError);assert.equal(r.reason.status,429);assert.equal(r.reason.code,'owner_capacity');assert.equal(r.reason.retryAfter,2);}
    const rest=await Promise.allSettled(Array.from({length:20},(_,i)=>stores[i%3].submit(`other-${i}`,fixture)));
    assert.equal(rest.filter(r=>r.status==='fulfilled').length,4);
    assert.equal(await stores[0].jobs.countDocuments(active),6);assert.equal(await stores[0].jobs.countDocuments({}),6);
    for(const r of rest)if(r.status==='rejected'){assert.equal(r.reason.status,503);assert.equal(r.reason.code,'global_capacity');}
    const row=(await stores[0].jobs.findOne({owner:'one'}))!;
    const replays=await Promise.all(Array.from({length:20},(_,i)=>stores[i%3].submit('one',JSON.parse(row.snapshot))));
    assert.ok(replays.every(j=>j.id===row.id&&j.globalSlot===row.globalSlot));
    assert.equal(await stores[0].jobs.countDocuments({}),6);
    const listed=await stores[0].list('one');assert.ok(listed.every(j=>!('globalSlot' in j)&&!('activeSlot' in j)));
    for(const bad of [{globalSlot:6},{activeSlot:2},{globalSlot:undefined},{activeSlot:undefined},{admittedAt:undefined}]){
      const input={...row,...bad,owner:'invalid',id:'f'.repeat(64)};delete (input as Partial<typeof input>)._id;
      await assert.rejects(stores[0].jobs.insertOne(input),/validation/i);
    }
  }finally{await stores[0].client.db(database).dropDatabase();await Promise.all(stores.map(s=>s.close()));}
});
test('retry and stale leases retain admission; terminal success/failure/exhaustion release it atomically',async()=>{
  const store=new JobStore(uri,name(),'',{global:1,perOwner:1});await store.initialize();
  try{
    const fixture=await researchFixture(),analysis=analyzeResearch(fixture),verification={engine:'test',comparisons:0,maxAbsoluteError:0};
    const fresh=()=>({...fixture,config:{...fixture.config,name:randomUUID()}});
    await store.submit('one',fixture);const old=(await store.claim(60000))!;
    assert.ok(old.admittedAt instanceof Date);assert.ok(old.firstClaimedAt instanceof Date);assert.ok(old.attemptStartedAt instanceof Date);
    await store.fail(old,'transient','Retry',true);await assert.rejects(store.submit('two',fresh()),(e:unknown)=>e instanceof ServiceError&&e.status===503);
    const current=(await store.claim(60000))!;assert.equal(current.attempts,2);assert.equal(+current.firstClaimedAt!,+old.firstClaimedAt!);
    assert.equal(await store.complete(old,analysis,verification),false);await store.fail(old,'stale','Stale',false);
    assert.equal(await store.jobs.countDocuments(active),1);assert.equal(await store.complete(current,analysis,verification),true);
    const done=(await store.get('one',old.id))!;assert.equal(done.globalSlot,undefined);assert.ok(done.completedAt instanceof Date);
    await store.submit('two',fresh());const permanent=(await store.claim(60000))!;await store.fail(permanent,'bad','Failed',false);
    assert.equal(await store.jobs.countDocuments(active),0);
    await store.submit('three',fresh());for(let i=1;i<=3;i++){const j=(await store.claim(60000))!;assert.equal(j.attempts,i);await store.jobs.updateOne({id:j.id},{$set:{leaseUntil:new Date(0)}});}
    assert.equal(await store.claim(60000),null);assert.equal(await store.jobs.countDocuments(active),0);
    await store.submit('four',fresh());assert.equal(await store.jobs.countDocuments(active),1);
  }finally{await store.client.db(store.jobs.dbName).dropDatabase();await store.close();}
});
test('HTTP overload distinguishes owner/global capacity and supplies Retry-After',async()=>{
  const database=name(),secret=randomBytes(32).toString('hex'),service=await createResearchService({uri,database,secret,host:'127.0.0.1',port:0,workers:1,mode:'cpp-verify',admission:{global:2,perOwner:1}});
  await service.runner.close();await new Promise<void>(r=>service.server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  try{
    const fixture=await researchFixture();
    const request=async(owner:string,title:string)=>{const body=JSON.stringify({snapshot:{...fixture,config:{...fixture.config,name:title}}});return fetch(origin+'/v1/jobs',{method:'POST',headers:{...await signResearchRequest(secret,owner,'POST','/v1/jobs',body),'Content-Type':'application/json'},body});};
    assert.equal((await request('one','Report A')).status,202);
    const owner=await request('one','Report B');assert.equal(owner.status,429);assert.equal(owner.headers.get('retry-after'),'2');assert.equal((await owner.json() as {code:string}).code,'owner_capacity');
    assert.equal((await request('two','Report C')).status,202);
    const global=await request('three','Report D');assert.equal(global.status,503);assert.equal(global.headers.get('retry-after'),'2');assert.equal((await global.json() as {code:string}).code,'global_capacity');
    assert.equal((await request('one','Report A')).status,202);assert.equal(await service.store.jobs.countDocuments({}),2);
  }finally{await service.close();const cleanup=new MongoClient(uri);await cleanup.db(database).dropDatabase();await cleanup.close();}
});
test('authenticated readWrite startup needs operator migration, safely repairs interruption and rejects unsafe validation modes',async()=>{
  const database=name(),admin=new MongoClient(uri),password=randomBytes(32).toString('hex'),appUrl=new URL(uri);appUrl.username='runtime';appUrl.password=password;appUrl.pathname='/'+database;appUrl.search='?authSource='+database;
  const app=new JobStore(appUrl.href,database,'',{global:4,perOwner:2}),second=new JobStore(appUrl.href,database,'',{global:4,perOwner:2});
  try{
    await admin.db(database).command({createUser:'runtime',pwd:password,roles:[{role:'readWrite',db:database}]});
    await admin.db(database).createCollection('research_jobs',{validator:legacy});
    const fixture=await researchFixture();
    const rows=await Promise.all(Array.from({length:3},async(_,i)=>{const snapshot={...fixture,config:{...fixture.config,name:`Legacy ${i}`}};return {owner:`legacy-${i%2}`,id:await researchFingerprint(snapshot),slot:Math.floor(i/2),name:snapshot.config.name,symbol:'TEST',created:new Date(),updated:new Date(),status:'queued' as const,attempts:0,snapshot:JSON.stringify(snapshot)};}));
    await app.jobs.insertMany(rows);
    await assert.rejects(app.initialize(),/operator must migrate/);
    await assert.rejects(app.initialize(appUrl.href),(e:unknown)=>(e as {code?:number}).code===13);
    await app.initialize(uri);
    assert.equal(await app.jobs.countDocuments(active),3);const saved=await app.jobs.find(active).toArray();assert.ok(saved.every(j=>j.globalSlot!==undefined&&j.activeSlot!==undefined&&j.admittedAt instanceof Date));
    // Simulates interruption after the barrier, before all legacy rows were repaired.
    await admin.db(database).collection('research_jobs').updateMany({owner:'legacy-0'},{$unset:{globalSlot:'',activeSlot:'',admittedAt:''}},{bypassDocumentValidation:true});
    await Promise.all([app.initialize(),second.initialize()]);
    assert.equal(new Set((await app.jobs.find(active).toArray()).map(j=>j.globalSlot)).size,3);
    // Deterministically repair between a stale row read and occupancy selection.
    await admin.db(database).collection('research_jobs').updateMany({owner:'legacy-0'},{$unset:{globalSlot:'',activeSlot:'',admittedAt:''}},{bypassDocumentValidation:true});
    const get=app.get.bind(app);let interleaved=false;
    app.get=async(...args)=>{const stale=await get(...args);if(!interleaved&&stale?.globalSlot===undefined){interleaved=true;await second.initialize();}return stale;};
    await app.initialize();app.get=get;assert.equal(interleaved,true);
    assert.equal(new Set((await app.jobs.find(active).toArray()).map(j=>j.globalSlot)).size,3);
    await assert.rejects(app.jobs.insertOne({...rows[0],owner:'old-writer',id:'e'.repeat(64)}),/validation/i);
    await admin.db(database).command({collMod:'research_jobs',validationAction:'warn'});await assert.rejects(app.initialize(),/strict, rejecting/);
    await admin.db(database).command({collMod:'research_jobs',validationAction:'error',validationLevel:'moderate'});await assert.rejects(app.initialize(),/strict, rejecting/);
  }finally{await admin.db(database).dropDatabase();await admin.close();await app.close();await second.close();}
});
test('oversized legacy queue is preserved and its validator remains unchanged before the barrier',async()=>{
  const database=name(),store=new JobStore(uri,database,'',{global:2,perOwner:1});
  try{
    await store.client.db(database).createCollection('research_jobs',{validator:legacy});const fixture=await researchFixture();
    for(let i=0;i<2;i++){const snapshot={...fixture,config:{...fixture.config,name:`Legacy ${i}`}};await store.jobs.insertOne({owner:'one',id:await researchFingerprint(snapshot),slot:i,name:'Legacy',symbol:'TEST',created:new Date(),updated:new Date(),status:'queued',attempts:0,snapshot:JSON.stringify(snapshot)});}
    await assert.rejects(store.initialize(uri),/Drain unfinished/);assert.equal(await store.jobs.countDocuments({}),2);
    const info=await store.client.db(database).listCollections({name:'research_jobs'},{nameOnly:false}).next();assert.deepEqual(info&&'options' in info?info.options?.validator:null,legacy);
  }finally{await store.client.db(database).dropDatabase();await store.close();}
});
