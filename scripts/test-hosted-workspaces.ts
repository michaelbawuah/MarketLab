import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {practicePrices,practiceActions,practiceDraft} from '../lib/practice-portfolio.ts';

type Request=(route:string,status:number,init?:RequestInit)=>Promise<Response>;
type Headers=Record<string,string>;
type Payload={portfolio:{snapshot:{name:string}};datasets:unknown[];runs:{name:string}[];dataset:{id:string};analysis:{value:string;cash:string;fees:string};fingerprint:string;run:{id:string};digest:string;path:string};
export async function testPersonalWorkspaces({request,owner,visitor,privateRunId}:{request:Request;owner:Headers;visitor:Headers;privateRunId:string}) {
  let checks=0;
  const post=(body:unknown,headers:Headers)=>({method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  const read=async(route:string,headers:Headers)=> (await request(route,200,{headers})).json() as Promise<Payload>;
  assert.equal((await read('/api/portfolio',visitor)).portfolio,null);
  assert.deepEqual((await read('/api/datasets',visitor)).datasets,[]);
  assert.deepEqual((await read('/api/research',visitor)).runs,[]);checks+=3;
  for(const route of [`/api/research?id=${privateRunId}`,`/api/research?id=${privateRunId}&download=json`,`/api/research?id=${privateRunId}&download=csv`,`/api/research/shares?id=${privateRunId}`,`/api/research/discussion?id=${privateRunId}`,`/api/research/jobs?id=${privateRunId}`])await request(route,404,{headers:visitor});
  await request('/api/research/jobs',404,post({id:privateRunId},visitor));
  const csv=await readFile(new URL('../public/examples/schwab-transactions.csv',import.meta.url),'utf8');
  const saved=(await (await request('/api/datasets',201,post(practicePrices,owner))).json() as Payload).dataset;
  for(const route of [`/api/datasets?id=${saved.id}`,`/api/datasets?id=${saved.id}&download=1`,`/api/actions?id=${saved.id}`,`/api/actions?id=${saved.id}&download=1`])await request(route,404,{headers:visitor});
  await request('/api/actions',404,post({datasetId:saved.id,revision:0,actions:practiceActions},visitor));
  await request('/api/portfolio',404,post({mode:'preview',revision:0,draft:practiceDraft(csv,saved.id)},visitor));
  await request('/api/datasets',201,post(practicePrices,visitor));
  const savedIds:string[]=[];
  for(const [index,headers] of [owner,visitor].entries()) {
    await request('/api/actions',201,post({datasetId:saved.id,revision:0,actions:practiceActions},headers));
    const draft={...practiceDraft(csv,saved.id),name:index===0?'Owner private portfolio':'New member portfolio'};
    const preview=await (await request('/api/portfolio',200,post({mode:'preview',revision:0,draft},headers))).json() as Payload;
    assert.equal(preview.analysis.value,'99497');assert.equal(preview.analysis.cash,'77897');assert.equal(preview.analysis.fees,'103');checks+=3;
    const result=await (await request('/api/portfolio',201,post({mode:'save',revision:0,draft,fingerprint:preview.fingerprint},headers))).json() as Payload;
    assert.equal(result.portfolio.snapshot.name,draft.name);checks++;
    // A fresh HTTP request loads durable records; supplied owner query fields do not select another account.
    assert.equal((await read('/api/portfolio?owner=hosted-fixture-owner',headers)).portfolio.snapshot.name,draft.name);checks++;
    for(const format of ['1','csv']){const report=await request('/api/portfolio?download='+format,200,{headers});assert.match(report.headers.get('cache-control')??'',/no-store/);assert.ok((await report.text()).includes(format==='1'?draft.name:'994.97'));checks+=2;}
    const research={name:index===0?'Owner private backtest':'Member backtest',assetId:saved.id,benchmarkId:saved.id,start:'2026-08-24',end:'2026-09-18',holdoutStart:'2026-09-10',window:5,initialCash:'10000',feeBps:10,slippageBps:5,confirmed:true};
    const experiment=await (await request('/api/research',200,post({mode:'preview',draft:research},headers))).json() as Payload;
    const run=await (await request('/api/research',200,post({mode:'save',draft:research,fingerprint:experiment.fingerprint},headers))).json() as Payload;savedIds.push(run.run.id);
    for(const format of ['json','csv']){const report=await request(`/api/research?id=${run.run.id}&download=${format}`,200,{headers});assert.ok((await report.text()).length>100);checks++;}
  }
  for(const [headers,id] of [[visitor,savedIds[0]],[owner,savedIds[1]]] as [Headers,string][]){await request('/api/research?id='+id,404,{headers});await request('/api/research/shares',404,post({action:'revoke',id,revision:1},headers));}
  assert.equal((await read('/api/portfolio',owner)).portfolio.snapshot.name,'Owner private portfolio');checks++;
  assert.deepEqual((await read('/api/research',visitor)).runs.map((r:{name:string})=>r.name),['Member backtest']);checks++;
  const sharePreview=await read('/api/research/shares?id='+savedIds[1],visitor);
  const sharing={action:'create',id:savedIds[1],revision:0,digest:sharePreview.digest,days:7,confirmed:true};
  const first=await (await request('/api/research/shares',200,post(sharing,visitor))).json() as Payload;
  await request(first.path,200);await request('/api/shared/'+first.path.split('/').at(-1),200);
  const replacement=await (await request('/api/research/shares',200,post({...sharing,revision:1},visitor))).json() as Payload;
  await request(first.path,404);await request(replacement.path,200);
  await request('/api/research/shares',200,post({action:'revoke',id:savedIds[1],revision:2},visitor));
  await request(replacement.path,404);
  console.log(`Personal workspaces: ${checks} additional persistence, import, export and isolation assertions passed for two independent accounts.`);
  return checks;
}
