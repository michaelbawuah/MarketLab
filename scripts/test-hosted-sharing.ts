/** Production-built Worker check, isolated local D1, fictional data only.
 * Headers emulate trusted Sites dispatch; this does not test the live dispatcher. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp,readFile,readdir,writeFile,rm,cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, Log, LogLevel, createFetchMock } from 'miniflare';
import { researchFixture } from '../tests/fixtures/research.ts';
import { analyzeResearch,researchFingerprint } from '../lib/finance/research.ts';
import { testDiscussion } from './test-hosted-discussion.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(path.join(tmpdir(),'marketlab-hosted-'));
const config=path.join(temporary,'dist/server/wrangler.json'),wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js'),persist=path.join(temporary,'db');
const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_LOG_PATH:path.join(temporary,'wrangler.log')};
const sqlString=(value:string)=>"'"+value.replaceAll("'","''")+"'";
Object.assign(process.env,env);
// Only the external provider is stubbed, using a deliberately fictional key.
// All application requests still pass through the built Worker and real local D1.
const providerKey='HOSTED_FICTIONAL_KEY',providerFetch=createFetchMock();
providerFetch.disableNetConnect();
providerFetch.get('https://www.alphavantage.co').intercept({path:`/query?function=TIME_SERIES_DAILY&symbol=NVDA&apikey=${providerKey}`}).reply(200,{Information:`Rate limit notice for ${providerKey}. CLIENT_DIAGNOSTIC_ONLY`});
let worker:Miniflare|undefined;
try {
  // Freeze the build under test away from the active preview/build watchers.
  await cp(path.join(root,'dist'),path.join(temporary,'dist'),{recursive:true});
  const build=JSON.parse(await readFile(config,'utf8')) as {name:string;main:string;compatibility_date:string;compatibility_flags:string[];d1_databases:{binding:string;database_id:string}[];assets:{directory:string}};
  const databaseId=build.d1_databases.find(database=>database.binding==='DB')?.database_id;
  assert.ok(databaseId,'The production build must declare its D1 binding');
  const serverRoot=path.dirname(config),moduleFiles=(await readdir(serverRoot,{recursive:true})).filter(file=>/\.(?:mjs|js)$/.test(file)&&file!==build.main);
  const modules=[build.main,...moduleFiles].map(file=>({type:'ESModule' as const,path:path.join(serverRoot,file)}));
  const snapshot=await researchFixture();snapshot.config.name='PRIVATE_FIXTURE_NAME';snapshot.asset.dataset.source='PRIVATE_FIXTURE_SOURCE';snapshot.asset.actions.source='PRIVATE_FIXTURE_EVENTS';
  const id=await researchFingerprint(snapshot),analysis=analyzeResearch(snapshot);
  const migrations=(await readdir(path.join(root,'drizzle'))).filter(v=>v.endsWith('.sql')).sort();
  let sql='';for(const migration of migrations)sql+=await readFile(path.join(root,'drizzle',migration),'utf8')+'\n';
  sql+='\nINSERT INTO research_runs (owner,id,name,created,symbol,benchmark,start,end,payload,result) VALUES ('+['hosted-fixture-owner',id,snapshot.config.name,'2026-09-26T00:00:00Z','XTEST','XTEST',snapshot.config.start,snapshot.config.end,JSON.stringify(snapshot),JSON.stringify(analysis)].map(sqlString).join(',')+');\n';
  const migrationFile=path.join(temporary,'schema-fixture.sql');await writeFile(migrationFile,sql);
  const seeded=spawnSync(process.execPath,[wrangler,'d1','execute','DB','--local','--config',config,'--persist-to',persist,'--file',migrationFile],{cwd:root,env,encoding:'utf8',timeout:45000});
  if(seeded.status!==0)throw new Error(`Local schema setup failed: ${seeded.stderr}\n${seeded.stdout}`);
  async function start(sharingEnabled:boolean) {
    // Run the exact production modules in workerd directly. Wrangler's extra
    // development proxy can return a spurious "restarted mid-request" 503 for
    // early rejected POSTs. No assertions or application/D1 responses are mocked.
    worker=new Miniflare({name:build.name,modules,modulesRoot:serverRoot,compatibilityDate:build.compatibility_date,compatibilityFlags:build.compatibility_flags,bindings:{WORKSPACE_OWNER_EMAIL:'owner@marketlab.test',...(sharingEnabled?{PUBLIC_REPORT_SHARING_ENABLED:'true'}:{})},d1Databases:{DB:databaseId!},d1Persist:path.join(persist,'v3/d1'),assets:{directory:path.resolve(serverRoot,build.assets.directory),routerConfig:{has_user_worker:true}},fetchMock:providerFetch,host:'127.0.0.1',port:0,cf:false,log:new Log(LogLevel.ERROR)});
    let startupTimer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([worker.ready,new Promise<never>((_,reject)=>{startupTimer=setTimeout(()=>reject(new Error('Worker did not start in 45 seconds')),45000);})]);}finally{clearTimeout(startupTimer);}
    return (await worker.ready).origin;
  }
  let base=await start(false);
  const owner={'oai-authenticated-user-id':'hosted-fixture-owner','oai-authenticated-user-email':'owner@marketlab.test'},visitor={'oai-authenticated-user-id':'other-user','oai-authenticated-user-email':'visitor@marketlab.test'};
  let assertions=0;
  async function request(route:string,status:number,init:RequestInit={}) {
    const r=await fetch(base+route,{...init,signal:AbortSignal.timeout(10000)});
    // Always drain the socket before the next request, including negative-path
    // assertions whose callers do not otherwise read their response bodies.
    const body=await r.text();
    assert.equal(r.status,status,`${init.method??'GET'} ${route.split('?')[0]}${r.status!==status?`: ${body}`:''}`);
    assertions++;
    return new Response(body,{status:r.status,statusText:r.statusText,headers:r.headers});
  }
  for(const route of ['/api/workspace','/api/datasets','/api/actions','/api/portfolio','/api/provider','/api/report','/api/research','/api/research/jobs','/api/research/shares']) {
    await request(route,401);await request(route,403,{headers:visitor});
  }
  const anonymous=await (await request('/',200)).text();assert.ok(anonymous.includes('Sign in with ChatGPT'));assert.ok(!anonymous.includes('PRIVATE_FIXTURE'));assertions+=2;
  const outsider=await (await request('/',200,{headers:visitor})).text();assert.ok(outsider.includes('This workspace is private'));assertions++;
  const api=await request('/api/research?id='+id,200,{headers:owner});assert.equal((await api.json() as {run:{name:string}}).run.name,'PRIVATE_FIXTURE_NAME');assertions++;
  const preview=await (await request('/api/research/shares?id='+id,200,{headers:owner})).json() as {digest:string;report:unknown;status:{revision:number};enabled:boolean};
  assert.ok(!JSON.stringify(preview.report).includes('PRIVATE_FIXTURE'));assertions++;
  const body={action:'create',id,revision:preview.status.revision,digest:preview.digest,days:7,confirmed:true};
  const post=(payload:unknown,headers:Record<string,string>=owner)=>({method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
  const providerRequest={symbol:'NVDA',mode:'key',apiKey:providerKey};
  await request('/api/provider',401,post(providerRequest,{}));
  await request('/api/provider',403,post(providerRequest,{...owner,origin:'https://unrelated.example.test'}));
  const providerFailure=await (await request('/api/provider',429,post(providerRequest))).json() as {diagnostic:{upstreamStatus:number;providerNotice:string}};
  assert.equal(providerFailure.diagnostic.upstreamStatus,200);
  assert.equal(providerFailure.diagnostic.providerNotice,'Rate limit notice for [key removed]. CLIENT_DIAGNOSTIC_ONLY');
  assert.ok(!JSON.stringify(providerFailure).includes(providerKey));assertions+=3;
  const providerHistory=await (await request('/api/provider',200,{headers:owner})).text();
  assert.ok(!providerHistory.includes('CLIENT_DIAGNOSTIC_ONLY')&&!providerHistory.includes(providerKey));assertions++;
  providerFetch.assertNoPendingInterceptors();

  // The direct-browser reservation never receives a key. Price transfers remain
  // client-supplied, are validated again, and cannot claim server provenance.
  const browserRoute='/api/provider/browser',browserStart={action:'start',symbol:'NVDA'};
  await request(browserRoute,401,post(browserStart,{}));
  await request(browserRoute,403,post(browserStart,visitor));
  await request(browserRoute,403,post(browserStart,{...owner,origin:'https://unrelated.example.test'}));
  await request(browserRoute,400,post({...browserStart,apiKey:'SHOULD_NOT_BE_ACCEPTED'}));
  await request(browserRoute,429,post(browserStart));
  const localDb=await worker!.getD1Database('DB');
  // Advance only the fictional fixture's reservation age, never the wall clock.
  await localDb.prepare('UPDATE provider_runs SET started = ? WHERE owner = ?').bind('2026-01-01T00:00:00Z','hosted-fixture-owner').run();
  const reservation=await (await request(browserRoute,201,post(browserStart))).json() as {requestId:string};
  await request(browserRoute,429,post(browserStart));
  await request('/api/provider',429,post(providerRequest));
  const browserData={symbol:'NVDA',refreshed:'2026-09-24',timezone:'US/Eastern',observations:[{date:'2026-09-23',close:'100'},{date:'2026-09-24',close:'101.1234'}]};
  const completion={action:'complete',requestId:reservation.requestId,data:browserData};
  await request(browserRoute,400,post({...completion,data:{...browserData,symbol:'IBM'}}));
  await request(browserRoute,400,post({...completion,data:{...browserData,origin:'alphavantage'}}));
  await request(browserRoute,400,post({...completion,data:{...browserData,observations:[browserData.observations[0],browserData.observations[0]]}}));
  await request(browserRoute,404,post(completion,{...owner,'oai-authenticated-user-id':'another-owner-fixture'}));
  const completions=await Promise.all([0,1].map(async()=>{const response=await fetch(base+browserRoute,{...post(completion),signal:AbortSignal.timeout(10000)});return {status:response.status,body:await response.json() as {dataset:{id:string;origin:string};message?:string}};}));
  assert.deepEqual(completions.map(r=>r.status).sort(),[201,409]);assertions++;
  const savedBrowser=completions.find(r=>r.status===201)!.body;
  assert.equal(savedBrowser.dataset.origin,'alphavantage-browser');assertions++;
  const savedData=await (await request('/api/datasets?id='+savedBrowser.dataset.id,200,{headers:owner})).json() as {origin:string;source:string;observations:{priceMicros:string}[]};
  assert.equal(savedData.origin,'alphavantage-browser');assert.equal(savedData.observations[1].priceMicros,'101123400');assert.match(savedData.source,/browser import/);assertions+=3;
  await request(browserRoute,409,post(completion));
  // A delayed failure callback must never downgrade a completed save.
  await request(browserRoute,200,post({action:'fail',requestId:reservation.requestId}));
  const completedRun=await localDb.prepare('SELECT status, dataset_id FROM provider_runs WHERE id = ?').bind(reservation.requestId).first<{status:string;dataset_id:string}>();
  assert.equal(completedRun?.status,'completed');assert.equal(completedRun?.dataset_id,savedBrowser.dataset.id);assertions+=2;
  const count=await localDb.prepare("SELECT COUNT(*) AS n FROM market_datasets WHERE owner = ? AND origin = 'alphavantage-browser'").bind('hosted-fixture-owner').first<{n:number}>();assert.equal(count?.n,1);assertions++;
  const allBrowserHistory=await (await request('/api/provider',200,{headers:owner})).text();
  assert.ok(!allBrowserHistory.includes('SHOULD_NOT_BE_ACCEPTED')&&!allBrowserHistory.includes(providerKey));assertions++;
  await localDb.prepare('UPDATE provider_runs SET started = ? WHERE owner = ?').bind('2026-01-01T00:00:00Z','hosted-fixture-owner').run();
  const expired=await (await request(browserRoute,201,post(browserStart))).json() as {requestId:string};
  await localDb.prepare('UPDATE provider_runs SET started = ? WHERE id = ?').bind('2026-01-01T00:00:00Z',expired.requestId).run();
  await request(browserRoute,409,post({...completion,requestId:expired.requestId}));
  await request(browserRoute,200,post({action:'fail',requestId:expired.requestId}));
  assert.equal(preview.enabled,false);assertions++;
  await request('/example',404);
  await request('/api/research/shares',503,post(body));
  await worker!.dispose();worker=undefined;base=await start(true);
  const example=await (await request('/example',200)).text();
  assert.ok(example.includes('PUBLIC FICTIONAL EXAMPLE'));assert.ok(!example.includes('PRIVATE_FIXTURE'));assertions+=2;
  const enabledPreview=await (await request('/api/research/shares?id='+id,200,{headers:owner})).json() as typeof preview;
  assert.equal(enabledPreview.enabled,true);assertions++;
  await request('/api/research/shares',401,post(body,{}));
  await request('/api/research/shares',403,post(body,{...owner,origin:'https://unrelated.example.test'}));
  await request('/api/research/shares',400,post({...body,confirmed:false}));
  const created=await (await request('/api/research/shares',200,post(body))).json() as {path:string;status:{revision:number}};
  const token=created.path.split('/').at(-1)!,publicApi=await request('/api/shared/'+token,200);
  for(const [header,pattern] of [['cache-control',/no-store/],['referrer-policy',/^no-referrer$/],['x-robots-tag',/noindex/],['content-security-policy',/frame-ancestors 'none'/]] as const){assert.match(publicApi.headers.get(header)??'',pattern,header);assertions++;}
  const summary=await publicApi.json() as {report:unknown};assert.deepEqual(summary.report,preview.report);assertions++;
  const page=await request(created.path,200),html=await page.text();assert.ok(html.includes('READ-ONLY REPORT'));assert.ok(!html.includes('PRIVATE_FIXTURE'));assert.match(page.headers.get('cache-control')??'',/no-store/);assertions+=3;
  await request('/api/shared/'+token,405,post({}));
  await request('/api/research/shares',409,post(body));
  await worker!.dispose();worker=undefined;base=await start(false);
  await request('/api/shared/'+token,404);await request(created.path,404);
  await worker!.dispose();worker=undefined;base=await start(true);
  await request('/api/shared/'+token,200);
  await request('/api/research/shares',200,post({action:'revoke',id,revision:created.status.revision}));
  await request('/api/shared/'+token,404);
  const revokedPage=await request(created.path,404);assert.ok((await revokedPage.text()).includes('This report link is unavailable'));assertions++;
  const discussionChecks = await testDiscussion({request,db:await worker!.getD1Database('DB') as unknown as D1Database,base,owner,visitor,runId:id});
  assertions += discussionChecks;
  console.log(`Built Worker: ${assertions} HTTP/header/content assertions passed. Activation gate, anonymous sharing, owner-only APIs, redaction, consent, cross-origin rejection, stale writes, read-only methods, revocation, provider diagnostics, browser-import reservations/provenance and invite-only discussion verified.`);
  console.log('Direct workerd, isolated local D1, fictional fixture and stubbed external provider only; the live Sites dispatcher and real provider access are outside this test.');
}finally {
  await worker?.dispose();
  await providerFetch.close();
  await rm(temporary,{recursive:true,force:true});
}
