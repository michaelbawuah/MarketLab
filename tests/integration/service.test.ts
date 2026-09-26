import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { JobStore,publicJob } from '../../services/research/store.ts';
import { createResearchService } from '../../services/research/server.ts';
import { signResearchRequest } from '../../lib/research-signing.ts';
import { analyzeResearch,researchFingerprint } from '../../lib/finance/research.ts';
import { researchFixture } from '../fixtures/research.ts';
const uri=process.env.MONGODB_TEST_URI;if(!uri)throw new Error('MONGODB_TEST_URI is required: these tests use a real disposable MongoDB database.');
const databaseName=()=>`marketlab_test_${randomUUID().replaceAll('-','')}`;
test('MongoDB enforces quota and idempotency under concurrent submissions, scopes owners and validates slot bounds',async()=>{
  const store=new JobStore(uri,databaseName());await store.initialize();
  try{
    const fixture=await researchFixture(),same=await Promise.all(Array.from({length:20},()=>store.submit('duplicate-owner',fixture)));assert.equal(new Set(same.map(j=>j.id)).size,1);assert.equal(await store.jobs.countDocuments({owner:'duplicate-owner'}),1);
    const submissions=await Promise.allSettled(Array.from({length:40},(_,i)=>store.submit('quota-owner',{...fixture,config:{...fixture.config,name:`Distinct run ${i}`}})));
    assert.equal(submissions.filter(r=>r.status==='fulfilled').length,30);assert.equal(await store.jobs.countDocuments({owner:'quota-owner'}),30);
    assert.equal(await store.get('other-owner',same[0].id),null);assert.deepEqual(await store.list('other-owner'),[]);
    await assert.rejects(store.jobs.insertOne({...same[0],owner:'bad-slot',slot:30}),/validation/i);
  }finally{await store.client.db(store.jobs.dbName).dropDatabase();await store.close();}
});
test('expired leases recover across connections, stale workers cannot commit and retries stop after three attempts',async()=>{
  const name=databaseName(),first=new JobStore(uri,name);await first.initialize();const fixture=await researchFixture();let store=first;
  try{
    await store.submit('lease-owner',fixture);const old=(await store.claim(60000))!;assert.equal(old.attempts,1);
    await store.jobs.updateOne({owner:old.owner,id:old.id},{$set:{leaseUntil:new Date(0)}});await store.close();store=new JobStore(uri,name);await store.initialize();
    const current=(await store.claim(60000))!;assert.equal(current.attempts,2);assert.notEqual(current.leaseToken,old.leaseToken);
    await store.fail(old,'stale','Must not requeue the new worker.',true);assert.equal((await store.get(old.owner,old.id))!.leaseToken,current.leaseToken);
    const analysis=analyzeResearch(fixture),verification={engine:'test',comparisons:0,maxAbsoluteError:0};
    assert.equal(await store.complete(old,analysis,verification),false);assert.equal(await store.heartbeat(old,60000),false);
    assert.equal(await store.complete(current,analysis,verification),true);assert.equal(await store.complete(current,analysis,verification),false);
    const done=(await store.get('lease-owner',old.id))!;assert.equal(done.status,'completed');assert.deepEqual(JSON.parse(done.result!),analysis);
    await store.submit('retry-owner',fixture);for(let attempt=1;attempt<=3;attempt++){const claim=(await store.claim(60000))!;assert.equal(claim.attempts,attempt);await store.jobs.updateOne({owner:claim.owner,id:claim.id},{$set:{leaseUntil:new Date(0)}});}
    assert.equal(await store.claim(60000),null);assert.equal((await store.get('retry-owner',old.id))!.status,'failed');
  }finally{await store.client.db(name).dropDatabase();await store.close();}
});
test('signed HTTP jobs persist real worker results, reject forgery/replay and isolate owners',async()=>{
  const secret=randomBytes(32).toString('hex'),name=databaseName(),service=await createResearchService({uri,database:name,secret,host:'127.0.0.1',port:0,workers:2,mode:'cpp-verify'});
  await new Promise<void>(resolve=>service.server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(service.server.address() as AddressInfo).port}`;
  const request=async(owner:string,method:string,path:string,body='')=>fetch(origin+path,{method,headers:{...await signResearchRequest(secret,owner,method,path,body),'Content-Type':'application/json'},body:method==='POST'?body:undefined});
  try{
    const snapshot=await researchFixture(),body=JSON.stringify({snapshot}),headers=await signResearchRequest(secret,'http-owner','POST','/v1/jobs',body);
    assert.equal((await fetch(origin+'/v1/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:body+' '})).status,401);
    const res=await fetch(origin+'/v1/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body});assert.equal(res.status,202);const submitted=await res.json() as {job:{id:string}};
    assert.equal((await fetch(origin+'/v1/jobs',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body})).status,409);
    assert.equal((await request('another-owner','GET',`/v1/jobs/${submitted.job.id}`)).status,404);
    const stale=await signResearchRequest(secret,'http-owner','GET','/v1/jobs');stale['x-marketlab-timestamp']='1000000000';assert.equal((await fetch(origin+'/v1/jobs',{headers:stale})).status,401);
    const deadline=Date.now()+10000;let job;
    do{const r=await request('http-owner','GET',`/v1/jobs/${submitted.job.id}`);job=(await r.json() as {job:ReturnType<typeof publicJob>}).job;if(job.status==='completed'||job.status==='failed')break;await new Promise(r=>setTimeout(r,30));}while(Date.now()<deadline);
    assert.equal(job!.status,'completed');assert.equal(job!.verification!.comparisons,9);assert.deepEqual(job!.analysis,analyzeResearch(snapshot));assert.equal(job!.id,await researchFingerprint(snapshot));
    const replay=await request('http-owner','POST','/v1/jobs',body);assert.equal(replay.status,200);assert.equal(await service.store.jobs.countDocuments({owner:'http-owner'}),1);
    const directory=await mkdtemp(join(tmpdir(),'marketlab-client-'));try{
      const source=join(directory,'input.json'),output=join(directory,'output.json');await writeFile(source,JSON.stringify({id:submitted.job.id,snapshot}));
      const client=spawn(process.execPath,['--experimental-strip-types','scripts/research-client.ts','submit',source,output],{env:{...process.env,RESEARCH_SERVICE_URL:origin,RESEARCH_SERVICE_SECRET:secret,RESEARCH_OWNER_ID:'http-owner'},stdio:'pipe'});
      let errors='';client.stderr.on('data',chunk=>{errors+=chunk;});const code=await new Promise((resolve,reject)=>{client.once('error',reject);client.once('exit',resolve);});assert.equal(code,0,errors);assert.deepEqual(JSON.parse(await readFile(output,'utf8')).analysis,analyzeResearch(snapshot));
    }finally{await rm(directory,{recursive:true,force:true});}
    const malformed=structuredClone(snapshot);malformed.asset.dataset.observations[0].priceMicros='-1';assert.equal((await request('http-owner','POST','/v1/jobs',JSON.stringify({snapshot:malformed}))).status,400);
    assert.equal((await fetch(origin+'/healthz')).status,200);
  }finally{await service.close();const cleanup=new JobStore(uri,name);await cleanup.client.connect();await cleanup.client.db(name).dropDatabase();await cleanup.close();}
});
