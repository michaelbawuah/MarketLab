/** Production-built Worker check, isolated local D1, fictional data only.
 * Headers emulate trusted Sites dispatch; this does not test the live dispatcher. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp,readFile,readdir,writeFile,rm,cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchFixture } from '../tests/fixtures/research.ts';
import { analyzeResearch,researchFingerprint } from '../lib/finance/research.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(path.join(tmpdir(),'marketlab-hosted-'));
const config=path.join(temporary,'dist/server/wrangler.json'),wrangler=path.join(root,'node_modules/wrangler/bin/wrangler.js'),persist=path.join(temporary,'db');
const env={...process.env,CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_LOG_PATH:path.join(temporary,'wrangler.log')};
const sqlString=(value:string)=>"'"+value.replaceAll("'","''")+"'";
Object.assign(process.env,env);
const {unstable_startWorker}=await import('wrangler');
let worker:Awaited<ReturnType<typeof unstable_startWorker>>|undefined;
try {
  // Freeze the build under test away from the active preview/build watchers.
  await cp(path.join(root,'dist'),path.join(temporary,'dist'),{recursive:true});
  await readFile(config);
  const snapshot=await researchFixture();snapshot.config.name='PRIVATE_FIXTURE_NAME';snapshot.asset.dataset.source='PRIVATE_FIXTURE_SOURCE';snapshot.asset.actions.source='PRIVATE_FIXTURE_EVENTS';
  const id=await researchFingerprint(snapshot),analysis=analyzeResearch(snapshot);
  const migrations=(await readdir(path.join(root,'drizzle'))).filter(v=>v.endsWith('.sql')).sort();
  let sql='';for(const migration of migrations)sql+=await readFile(path.join(root,'drizzle',migration),'utf8')+'\n';
  sql+='\nINSERT INTO research_runs (owner,id,name,created,symbol,benchmark,start,end,payload,result) VALUES ('+['hosted-fixture-owner',id,snapshot.config.name,'2026-09-26T00:00:00Z','XTEST','XTEST',snapshot.config.start,snapshot.config.end,JSON.stringify(snapshot),JSON.stringify(analysis)].map(sqlString).join(',')+');\n';
  const migrationFile=path.join(temporary,'schema-fixture.sql');await writeFile(migrationFile,sql);
  const seeded=spawnSync(process.execPath,[wrangler,'d1','execute','DB','--local','--config',config,'--persist-to',persist,'--file',migrationFile],{cwd:root,env,encoding:'utf8',timeout:45000});
  if(seeded.status!==0)throw new Error(`Local schema setup failed: ${seeded.stderr}\n${seeded.stdout}`);
  async function start(sharingEnabled:boolean) {
    // Isolate Wrangler's service-discovery registry too. Another local preview
    // with the same Worker name must not reload this verification process.
    worker=await unstable_startWorker({config,bindings:{WORKSPACE_OWNER_EMAIL:{type:'plain_text',value:'owner@marketlab.test'},...(sharingEnabled?{PUBLIC_REPORT_SHARING_ENABLED:{type:'plain_text' as const,value:'true'}}:{})},sendMetrics:false,dev:{remote:false,persist,registry:path.join(temporary,'registry'),watch:false,inspector:false,logLevel:'error',server:{hostname:'127.0.0.1',port:0}}});
    let startupTimer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([worker.ready,new Promise<never>((_,reject)=>{startupTimer=setTimeout(()=>reject(new Error('Worker did not start in 45 seconds')),45000);})]);}finally{clearTimeout(startupTimer);}
    return (await worker.url).origin;
  }
  let base=await start(false);
  const owner={'oai-authenticated-user-id':'hosted-fixture-owner','oai-authenticated-user-email':'owner@marketlab.test'},visitor={'oai-authenticated-user-id':'other-user','oai-authenticated-user-email':'visitor@marketlab.test'};
  let assertions=0;
  async function request(route:string,status:number,init:RequestInit={}) {
    // Rejected POSTs may finish before their incoming body is consumed. Use a
    // fresh HTTP connection so Wrangler's development proxy cannot reuse a
    // socket the Worker has closed; do not retry or relax any assertion.
    const requestHeaders=new Headers(init.headers);requestHeaders.set('Connection','close');
    const r=await fetch(base+route,{...init,headers:requestHeaders,signal:AbortSignal.timeout(10000)});
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
  console.log(`Built Worker: ${assertions} HTTP/header/content assertions passed. Activation gate, anonymous sharing, owner-only APIs, redaction, consent, cross-origin rejection, stale writes, read-only methods and revocation verified.`);
  console.log('Isolated local D1 and fictional fixture only; the live Sites dispatcher is outside this test.');
}finally {
  await worker?.dispose();
  await rm(temporary,{recursive:true,force:true});
}
