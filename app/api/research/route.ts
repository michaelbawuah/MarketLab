import { researchCertificate, withConfidenceCSV } from '@/lib/finance/confidence';
import { attachReplayReceipt } from '@/lib/research-replay';
import { database, identity, json, failure, requestBody, HttpError } from '@/lib/server';
import { datasetFields, datasetSummary, type DatasetRow } from '@/lib/datasets';
import type { PortfolioBinding } from '@/lib/finance/historical-portfolio';
import { analyzeResearch, validateResearchDraft, researchFingerprint, researchCSV, RESEARCH_METHOD, RESEARCH_ASSUMPTIONS, MAX_RESEARCH_RUNS, type ResearchSnapshot, type ResearchAnalysis, type RunSummary, type SavedResearch } from '@/lib/finance/research';
type Row = {id:string;name:string;created:string;symbol:string;benchmark:string;start:string;end:string;payload:string;result:string};
const fields='id, name, created, symbol, benchmark, start, end';
function saved(row:Row):SavedResearch {return {id:row.id,name:row.name,created:row.created,symbol:row.symbol,benchmark:row.benchmark,start:row.start,end:row.end,snapshot:JSON.parse(row.payload),analysis:JSON.parse(row.result)};}
async function binding(owner:string,id:string):Promise<PortfolioBinding> {
  const row=await database().prepare(`SELECT ${datasetFields}, observations FROM market_datasets WHERE owner = ? AND id = ?`).bind(owner,id).first<DatasetRow>();
  if(!row)throw new HttpError('Selected dataset is unavailable.',404);
  const actions=await database().prepare('SELECT source, events, revision, updated FROM corporate_actions WHERE owner = ? AND dataset_id = ?').bind(owner,id).first<{source:string;events:string;revision:number;updated:string}>();
  if(!actions)throw new HttpError(`${row.symbol}: save a complete split/dividend record in Historical data first, including an explicit no-event record if appropriate.`);
  return {dataset:{...datasetSummary(row),observations:JSON.parse(row.observations!)},actions:{source:actions.source,complete:true,events:JSON.parse(actions.events),revision:actions.revision,updated:actions.updated}};
}
export async function GET(request:Request) {
  try{
    const owner=await identity(),url=new URL(request.url),id=url.searchParams.get('id');
    if(!id){const r=await database().prepare(`SELECT ${fields} FROM research_runs WHERE owner = ? ORDER BY created DESC, id DESC`).bind(owner).all<RunSummary>();return json({runs:r.results,limit:MAX_RESEARCH_RUNS});}
    if(!/^[a-f0-9]{64}$/.test(id))throw new HttpError('Invalid research run.');
    const row=await database().prepare(`SELECT ${fields}, payload, result FROM research_runs WHERE owner = ? AND id = ?`).bind(owner,id).first<Row>();if(!row)throw new HttpError('Research run not found.',404);
    const run=await attachReplayReceipt(database(),owner,saved(row)),download=url.searchParams.get('download');
    if(download==='json'||download==='csv')return new Response(download==='csv'?withConfidenceCSV(researchCSV(run),researchCertificate(run)):JSON.stringify({format:'marketlab-research-v1',...run,assumptions:RESEARCH_ASSUMPTIONS,confidence:researchCertificate(run)},null,2),{headers:{'Content-Type':download==='csv'?'text/csv; charset=utf-8':'application/json','Content-Disposition':`attachment; filename="marketlab-research-${id.slice(0,12)}.${download}"`,'Cache-Control':'no-store'}});
    return json({run});
  }catch(e){return failure(e);}
}
export async function POST(request:Request) {
  try{
    const owner=await identity(),body=await requestBody(request,8192) as Record<string,unknown>;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['mode','draft','fingerprint'].includes(k))||!['preview','save'].includes(body.mode as string))throw new HttpError('Invalid research request.');
    let config;try{config=validateResearchDraft(body.draft);}catch(e){throw new HttpError((e as Error).message);}
    const asset=await binding(owner,config.assetId),benchmark=config.benchmarkId===config.assetId?asset:await binding(owner,config.benchmarkId);
    const snapshot:ResearchSnapshot={method:RESEARCH_METHOD,config,asset,benchmark},payload=JSON.stringify(snapshot);
    if(new TextEncoder().encode(payload).length>1024*1024)throw new HttpError('Research inputs exceed 1 MiB.',413);
    let analysis:ResearchAnalysis;try{analysis=analyzeResearch(snapshot);}catch(e){throw new HttpError((e as Error).message);}
    const result=JSON.stringify(analysis);
    // D1's 2,000,000-byte row ceiling applies to the whole row, not each column.
    if(new TextEncoder().encode(payload).length+new TextEncoder().encode(result).length>1900000)throw new HttpError('Combined research inputs and results exceed the saved-run size limit. Choose a shorter evaluation range.',413);
    const id=await researchFingerprint(snapshot);
    if(body.mode==='preview')return json({analysis,fingerprint:id,confidence:researchCertificate({id,snapshot,analysis})});
    if(body.fingerprint!==id)throw new HttpError('Inputs changed since preview. Run the preview again before saving.',409);
    const created=new Date().toISOString();
    await database().prepare(`INSERT OR IGNORE INTO research_runs (owner,id,name,created,symbol,benchmark,start,end,payload,result) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM research_runs WHERE owner = ?) < ?`).bind(owner,id,config.name,created,asset.dataset.symbol,benchmark.dataset.symbol,config.start,config.end,payload,result,owner,MAX_RESEARCH_RUNS).run();
    const row=await database().prepare(`SELECT ${fields}, payload, result FROM research_runs WHERE owner = ? AND id = ?`).bind(owner,id).first<Row>();
    if(!row)throw new HttpError(`This workspace has reached its ${MAX_RESEARCH_RUNS}-run limit.`,409);
    return json({run:await attachReplayReceipt(database(),owner,saved(row)),message:'Research run saved with frozen inputs and results.'});
  }catch(e){return failure(e);}
}
