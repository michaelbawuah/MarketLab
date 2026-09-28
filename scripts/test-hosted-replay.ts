/** Real Python verifier -> mocked HTTPS transport -> production Worker + D1. */
import assert from 'node:assert/strict';
import type { createFetchMock } from 'miniflare';
import { PythonReplay } from '../services/research/python-replay.ts';
import { replayReportJSON } from '../lib/finance/replay-receipt.ts';
import type { SavedResearch } from '../lib/finance/research.ts';
import type { SharedResearch } from '../lib/finance/shared-research.ts';
export const replayTestBindings={RESEARCH_SERVICE_URL:'https://replay.marketlab.test',RESEARCH_SERVICE_SECRET:'fictional-replay-secret-for-isolated-tests-only'};
export async function testHostedReplay({request,providerFetch,db,owner,visitor,runId}:{
  request:(route:string,status:number,init?:RequestInit)=>Promise<Response>;providerFetch:ReturnType<typeof createFetchMock>;
  db:D1Database;owner:Record<string,string>;visitor:Record<string,string>;runId:string;
}){
  let checks=0;const transfers:Promise<string>[]=[];
  const route='/api/research/replay',post=(payload:unknown,headers:Record<string,string>=owner)=>({method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
  const run=(await (await request('/api/research?id='+runId,200,{headers:owner})).json() as {run:SavedResearch}).run;
  const raw=replayReportJSON(run),receipt=await new PythonReplay().verify(Buffer.from(raw));
  await request(route,401,post({id:runId},{}));await request(route,403,post({id:runId},visitor));
  await request(route,403,post({id:runId},{...owner,origin:'https://unrelated.test'}));
  await request(route,404,post({id:runId},{...owner,'oai-authenticated-user-id':'other-owner-id'}));
  await request(route,400,post({id:runId,receipt}));await request(route,404,post({id:'a'.repeat(64)}));
  const mock=(status:number,value:unknown)=>providerFetch.get(replayTestBindings.RESEARCH_SERVICE_URL).intercept({path:'/v1/replay',method:'POST'}).reply(options=>{transfers.push(new Response(options.body as BodyInit).text());return {statusCode:status,data:JSON.stringify(value),responseOptions:{headers:{'Content-Type':'application/json'}}};});
  mock(422,{error:'private diagnostic must not be forwarded'});const failed=await request(route,422,post({id:runId}));assert.ok(!(await failed.text()).includes('private diagnostic'));checks++;
  mock(200,{receipt:{...receipt,reportDigest:'b'.repeat(64)}});await request(route,503,post({id:runId}));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM research_replay_receipts').bind().first<{n:number}>())?.n,0);checks++;
  mock(200,{receipt});const verified=await (await request(route,200,post({id:runId}))).json() as {receipt:unknown;cached:boolean};assert.deepEqual(verified.receipt,receipt);assert.equal(verified.cached,false);checks+=2;
  // No interceptor remains: the second request must reuse the bound stored result.
  const cached=await (await request(route,200,post({id:runId}))).json() as typeof verified;assert.equal(cached.cached,true);assert.deepEqual(cached.receipt,receipt);checks+=2;
  const loaded=await (await request('/api/research?id='+runId,200,{headers:owner})).json() as {run:SavedResearch};assert.deepEqual(loaded.run.replayReceipt,receipt);checks++;
  const exported=await (await request('/api/research?id='+runId+'&download=json',200,{headers:owner})).json() as SavedResearch&{confidence:{independentReplay:{verifiedAt:string}}};assert.deepEqual(exported.replayReceipt,receipt);assert.equal(exported.confidence.independentReplay.verifiedAt,receipt.verifiedAt);checks+=2;
  assert.ok((await (await request('/api/research?id='+runId+'&download=csv',200,{headers:owner})).text()).includes('marketlab-python-replay-v1'));checks++;
  const preview=await (await request('/api/research/shares?id='+runId,200,{headers:owner})).json() as {report:SharedResearch;digest:string;status:{revision:number}};
  assert.equal(preview.report.certificates.full.independentReplay?.verifiedAt,receipt.verifiedAt);assert.ok(!JSON.stringify(preview.report).includes(receipt.reportDigest));checks+=2;
  const shared=await (await request('/api/research/shares',200,post({action:'create',id:runId,revision:preview.status.revision,digest:preview.digest,days:7,confirmed:true}))).json() as {path:string;status:{revision:number}};
  assert.ok((await (await request(shared.path,200)).text()).includes('Python replay passed'));checks++;
  await request('/api/research/shares',200,post({action:'revoke',id:runId,revision:shared.status.revision}));
  // Changing an unchecked risk scalar leaves local consistency checks unchanged,
  // but must strip Python evidence on reads, downloads and the next share preview.
  const changed=structuredClone(run.analysis);changed.full.strategyRisk.volatilityPct=999;
  await db.prepare('UPDATE research_runs SET result=? WHERE owner=? AND id=?').bind(JSON.stringify(changed),owner['oai-authenticated-user-id'],runId).run();
  const stale=await (await request('/api/research?id='+runId+'&download=json',200,{headers:owner})).json() as SavedResearch&{confidence:{independentReplay?:unknown}};
  assert.equal(stale.replayReceipt,undefined);assert.equal(stale.confidence.independentReplay,undefined);checks+=2;
  const changedPreview=await (await request('/api/research/shares?id='+runId,200,{headers:owner})).json() as typeof preview;assert.equal(changedPreview.report.certificates.full.independentReplay,undefined);checks++;
  await db.prepare('UPDATE research_runs SET result=? WHERE owner=? AND id=?').bind(JSON.stringify(run.analysis),owner['oai-authenticated-user-id'],runId).run();
  for(const transfer of transfers){assert.equal(await transfer,raw);checks++;}
  providerFetch.assertNoPendingInterceptors();return checks;
}
