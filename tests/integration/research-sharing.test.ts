import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { analyzeResearch,researchFingerprint } from '../../lib/finance/research.ts';
import { sharingPreview,createShare,revokeShare,readShare,ShareError,ownedResearch } from '../../lib/research-sharing.ts';
import { researchFixture } from '../fixtures/research.ts';
import { saveReplayReceipt,attachReplayReceipt } from '../../lib/research-replay.ts';
import { replayReportJSON,checkedReplayReceipt } from '../../lib/finance/replay-receipt.ts';
import { PythonReplay } from '../../services/research/python-replay.ts';

// Execute the actual generated schema and production prepared statements in
// SQLite. Worker/dispatcher behavior is checked separately against a built Worker.
async function setup() {
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../../drizzle/${file}`,import.meta.url),'utf8'));
  const db={
    prepare(sql:string){
      const query=sqlite.prepare(sql);
      return {bind(...params:(string|number|null)[]){return {
        async first(){return query.get(...params)??null;},
        async all(){return {results:query.all(...params)};},
        async run(){return {meta:{changes:Number(query.run(...params).changes)}};},
      };}};
    },
  } as unknown as D1Database;
  const snapshot=await researchFixture(),id=await researchFingerprint(snapshot),analysis=analyzeResearch(snapshot);
  for(const owner of ['owner-a','owner-b'])sqlite.prepare('INSERT INTO research_runs (owner,id,name,created,symbol,benchmark,start,end,payload,result) VALUES (?,?,?,?,?,?,?,?,?,?)').run(owner,id,'Private name','2026-09-26','XTEST','XTEST',snapshot.config.start,snapshot.config.end,JSON.stringify(snapshot),JSON.stringify(analysis));
  const now=new Date('2026-09-26T12:00:00Z'),preview=await sharingPreview(db,'owner-a',id,now);
  return {sqlite,db,id,now,preview,input:{id,revision:0,digest:preview.digest,days:7,confirmed:true}};
}
const rejected=(status:number)=>(e:unknown)=>e instanceof ShareError&&e.status===status;
test('real replay receipts survive reads, isolate owners, reject stale rows and require fresh sharing consent',async()=>{
  const f=await setup();try{
    const run=await ownedResearch(f.db,'owner-a',f.id),link=await createShare(f.db,'owner-a',f.input,f.now),token=link.path.split('/').at(-1)!;
    const receipt=await new PythonReplay().verify(Buffer.from(replayReportJSON(run)));
    assert.deepEqual(await saveReplayReceipt(f.db,'owner-a',run,receipt),receipt);
    assert.deepEqual((await ownedResearch(f.db,'owner-a',f.id)).replayReceipt,receipt);
    assert.equal((await attachReplayReceipt(f.db,'owner-b',{...run,replayReceipt:receipt})).replayReceipt,undefined);
    const next=await sharingPreview(f.db,'owner-a',f.id,f.now);assert.notEqual(next.digest,f.preview.digest);
    assert.equal(next.report.certificates.full.checks.find(c=>c.id==='independent-replay')?.status,'passed');
    assert.equal(next.report.certificates.holdout.independentReplay?.comparedFields,receipt.comparedFields);
    const redacted=JSON.stringify(next.report);assert.ok(!redacted.includes(f.id));assert.ok(!redacted.includes(receipt.reportDigest));assert.ok(!redacted.includes('Private name'));
    assert.deepEqual((await readShare(f.db,token,f.now))?.report,f.preview.report,'Published summaries remain frozen');
    await assert.rejects(createShare(f.db,'owner-a',{...f.input,revision:1},f.now),rejected(409));
    const changed=structuredClone(run);changed.analysis.full.strategyRisk.volatilityPct=999;
    f.sqlite.prepare('UPDATE research_runs SET result=? WHERE owner=? AND id=?').run(JSON.stringify(changed.analysis),'owner-a',f.id);
    assert.equal((await ownedResearch(f.db,'owner-a',f.id)).replayReceipt,undefined);
    assert.equal((await sharingPreview(f.db,'owner-a',f.id,f.now)).report.certificates.full.independentReplay,undefined);
    assert.equal(await saveReplayReceipt(f.db,'owner-a',run,receipt),null,'The receipt write must fence the report sent for checking');
    assert.equal(await saveReplayReceipt(f.db,'owner-a',changed,receipt),null);
    for(const patch of [{verified:false},{reportId:'b'.repeat(64)},{comparedFields:NaN},{verifiedAt:'2100-01-01T00:00:00.000Z'},{floatRelativeTolerance:.1},{extra:true}])assert.equal(checkedReplayReceipt({...receipt,...patch},receipt.reportId,receipt.reportDigest),null);
  }finally{f.sqlite.close();}
});
test('new sharing requires consent, the reviewed digest and ownership',async()=>{
  const f=await setup();try{
    await assert.rejects(createShare(f.db,'owner-a',{...f.input,confirmed:false},f.now),rejected(400));
    await assert.rejects(createShare(f.db,'owner-a',{...f.input,digest:'0'.repeat(64)},f.now),rejected(409));
    await assert.rejects(sharingPreview(f.db,'stranger',f.id,f.now),rejected(404));
    await assert.rejects(createShare(f.db,'stranger',f.input,f.now),rejected(404));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM research_shares').get()!.n,0);
  }finally{f.sqlite.close();}
});
test('an unguessable link reads exactly its reviewed summary; the token is not stored',async()=>{
  const f=await setup();try{
    const link=await createShare(f.db,'owner-a',f.input,f.now),token=link.path.split('/').at(-1)!;
    assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(token,f.id);
    const publicValue=await readShare(f.db,token,f.now);assert.deepEqual(publicValue?.report,f.preview.report);
    const stored=f.sqlite.prepare('SELECT * FROM research_shares').get()!;assert.ok(!JSON.stringify(stored).includes(token));
    assert.equal(await readShare(f.db,f.id,f.now),null);assert.equal(await readShare(f.db,'../malformed',f.now),null);
    assert.ok(f.sqlite.prepare('EXPLAIN QUERY PLAN SELECT report FROM research_shares WHERE token_hash = ?').all('x').some(row=>String(row.detail).includes('research_shares_token_hash')));
  }finally{f.sqlite.close();}
});
test('concurrent first creations allow one committed link and return a conflict for the other',async()=>{
  const f=await setup();try{
    const results=await Promise.allSettled([createShare(f.db,'owner-a',f.input,f.now),createShare(f.db,'owner-a',f.input,f.now)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const rejectedResult=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.ok(rejected(409)(rejectedResult.reason));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM research_shares').get()!.n,1);
  }finally{f.sqlite.close();}
});
test('replacement and revocation invalidate old links while stale mutations cannot revive them',async()=>{
  const f=await setup();try{
    const first=await createShare(f.db,'owner-a',f.input,f.now),old=first.path.split('/').at(-1)!;
    const next=await createShare(f.db,'owner-a',{...f.input,revision:1},f.now),token=next.path.split('/').at(-1)!;
    assert.equal(await readShare(f.db,old,f.now),null);assert.ok(await readShare(f.db,token,f.now));
    await assert.rejects(revokeShare(f.db,'owner-a',f.id,1,f.now),rejected(409));
    await revokeShare(f.db,'owner-a',f.id,2,f.now);assert.equal(await readShare(f.db,token,f.now),null);
    await assert.rejects(createShare(f.db,'owner-a',{...f.input,revision:2},f.now),rejected(409));
    assert.equal((await sharingPreview(f.db,'owner-a',f.id,f.now)).status.active,false);
  }finally{f.sqlite.close();}
});
test('identical experiment fingerprints in another workspace do not confer link ownership',async()=>{
  const f=await setup();try{
    const link=await createShare(f.db,'owner-a',f.input,f.now),token=link.path.split('/').at(-1)!;
    assert.equal((await sharingPreview(f.db,'owner-b',f.id,f.now)).status.active,false);
    await assert.rejects(revokeShare(f.db,'owner-b',f.id,1,f.now),rejected(409));assert.ok(await readShare(f.db,token,f.now));
    const other=await createShare(f.db,'owner-b',f.input,f.now);assert.notEqual(other.path,link.path);
    await revokeShare(f.db,'owner-b',f.id,1,f.now);assert.ok(await readShare(f.db,token,f.now));
  }finally{f.sqlite.close();}
});
test('expiry is enforced at the exact boundary and altered stored payloads fail closed',async()=>{
  const f=await setup();try{
    const link=await createShare(f.db,'owner-a',f.input,f.now),token=link.path.split('/').at(-1)!,expires=new Date(link.status.expires);
    assert.ok(await readShare(f.db,token,new Date(expires.getTime()-1)));assert.equal(await readShare(f.db,token,expires),null);
    f.sqlite.prepare('UPDATE research_shares SET report = ?').run('{}');await assert.rejects(readShare(f.db,token,f.now),rejected(503));
  }finally{f.sqlite.close();}
});
