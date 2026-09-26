import { portfolioCertificate, withConfidenceCSV } from '@/lib/finance/confidence';
import { database, identity, json, failure, requestBody, HttpError } from '@/lib/server';
import { datasetFields, datasetSummary, type DatasetRow } from '@/lib/datasets';
import { analyzePortfolio, validatePortfolioDraft, portfolioFingerprint, PORTFOLIO_METHOD, type PortfolioSnapshot, type SavedPortfolio, type PortfolioBinding } from '@/lib/finance/historical-portfolio';
import type { SavedActions } from '@/lib/finance/corporate-actions';
import { BENCHMARK_METHOD, BENCHMARK_ASSUMPTIONS, comparePortfolio, portfolioHistoryCSV } from '@/lib/finance/portfolio-benchmark';

type Row = { revision: number; fingerprint: string; updated: string; payload: string };
function saved(row:Row):SavedPortfolio { return {revision:row.revision,fingerprint:row.fingerprint,updated:row.updated,snapshot:JSON.parse(row.payload)}; }
async function current(owner:string) { return database().prepare('SELECT revision, fingerprint, updated, payload FROM historical_portfolios WHERE owner = ?').bind(owner).first<Row>(); }
async function loadBinding(owner: string, datasetId: string, symbol?: string): Promise<PortfolioBinding> {
  const row = await database().prepare(`SELECT ${datasetFields}, observations FROM market_datasets WHERE owner = ? AND id = ?`).bind(owner, datasetId).first<DatasetRow>();
  if (!row || (symbol && row.symbol !== symbol)) throw new HttpError(`Dataset for ${symbol || 'the benchmark'} is unavailable or does not match.`, 404);
  const action = await database().prepare('SELECT source, events, revision, updated FROM corporate_actions WHERE owner = ? AND dataset_id = ?').bind(owner, datasetId).first<{ source: string; events: string; revision: number; updated: string }>();
  if (!action) throw new HttpError(`${row.symbol}: save a complete split/dividend record in Historical data first, including an explicit no-event record if appropriate.`);
  const actions: SavedActions = { source: action.source, complete: true, events: JSON.parse(action.events), revision: action.revision, updated: action.updated };
  return { dataset: { ...datasetSummary(row), observations: JSON.parse(row.observations!) }, actions };
}
export async function GET(request:Request) {
  try {
    const owner=await identity(), row=await current(owner);
    if(!row)return json({portfolio:null,analysis:null,comparison:null});
    const portfolio=saved(row),analysis=analyzePortfolio(portfolio.snapshot),comparison=comparePortfolio(portfolio.snapshot,analysis),download=new URL(request.url).searchParams.get('download');
    if(download==='csv')return new Response(withConfidenceCSV(portfolioHistoryCSV(analysis,comparison),portfolioCertificate(portfolio.snapshot,analysis,comparison,portfolio.fingerprint)),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="marketlab-portfolio-r${portfolio.revision}.csv"`,'Cache-Control':'no-store'}});
    if(download==='1')return new Response(JSON.stringify({format:comparison?'marketlab-portfolio-v2':'marketlab-portfolio-v1',...portfolio,confidence:portfolioCertificate(portfolio.snapshot,analysis,comparison,portfolio.fingerprint),assumptions:{currency:'USD',timing:'splits and dividend entitlement before close; ledger events at close in CSV order',dividends:'aggregate entitlement rounded half up to cents on ex-date; cash only after an explicit matching payment',prices:'exact-date raw closes; no stale or future substitution',cost:'weighted average including buy fees; research, not tax-lot accounting',fractions:'retained exactly; cash in lieu unsupported',coverage:'user-declared event completeness and instrument mapping',...(comparison?{benchmark:BENCHMARK_ASSUMPTIONS}:{})},analysis,...(comparison?{comparison}:{})},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="marketlab-portfolio-r${portfolio.revision}.json"`,'Cache-Control':'no-store'}});
    return json({portfolio,analysis,comparison});
  }catch(e){return failure(e);}
}
export async function POST(request:Request) {
  try {
    const owner=await identity(),body=await requestBody(request,256*1024*6+8192) as Record<string,unknown>;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['mode','revision','fingerprint','draft'].includes(k))||!['preview','save'].includes(body.mode as string)||!Number.isSafeInteger(body.revision)||(body.revision as number)<0)throw new HttpError('Invalid portfolio request.');
    let d;try{d=validatePortfolioDraft(body.draft);}catch(e){throw new HttpError((e as Error).message);}
    const bindings:PortfolioBinding[]=[];
    for(const binding of d.bindings) bindings.push(await loadBinding(owner,binding.datasetId,binding.symbol));
    const benchmarkBinding=d.benchmarkDatasetId?(bindings.find(b=>b.dataset.id===d.benchmarkDatasetId)??await loadBinding(owner,d.benchmarkDatasetId)):undefined;
    const snapshot:PortfolioSnapshot={method:PORTFOLIO_METHOD,name:d.name,asOf:d.asOf,transactions:d.transactions,bindings,...(benchmarkBinding?{benchmark:{method:BENCHMARK_METHOD,binding:benchmarkBinding}}:{})},payload=JSON.stringify(snapshot);
    if(new TextEncoder().encode(payload).length>1024*1024)throw new HttpError('Combined portfolio snapshots must be 1 MiB or smaller. Choose shorter datasets or fewer symbols.',413);
    let analysis,comparison;try{analysis=analyzePortfolio(snapshot);comparison=comparePortfolio(snapshot,analysis);}catch(e){throw new HttpError((e as Error).message);}
    const fingerprint=await portfolioFingerprint(snapshot),existing=await current(owner);
    if(body.mode==='preview')return json({analysis,comparison,fingerprint,confidence:portfolioCertificate(snapshot,analysis,comparison,fingerprint)});
    if(body.fingerprint!==fingerprint)throw new HttpError('Inputs changed since preview. Validate and preview again before saving.',409);
    if(existing?.fingerprint===fingerprint)return json({portfolio:saved(existing),analysis,comparison,message:'This exact portfolio is already saved. No duplicate created.'});
    const revision=body.revision as number,updated=new Date().toISOString(),db=database();
    const result=revision===0
      ?await db.prepare('INSERT OR IGNORE INTO historical_portfolios (owner, revision, fingerprint, updated, payload) VALUES (?, 1, ?, ?, ?)').bind(owner,fingerprint,updated,payload).run()
      :await db.prepare('UPDATE historical_portfolios SET revision = revision + 1, fingerprint = ?, updated = ?, payload = ? WHERE owner = ? AND revision = ?').bind(fingerprint,updated,payload,owner,revision).run();
    if(!result.meta.changes)throw new HttpError('This portfolio changed in another tab. Close the editor and reload before importing again.',409);
    return json({portfolio:{revision:revision+1,fingerprint,updated,snapshot},analysis,comparison,message:'Historical portfolio saved and reconciled.'},revision===0?201:200);
  }catch(e){return failure(e);}
}
