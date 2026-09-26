import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDemo, demoReport, DEMO_COSTS } from '../../lib/finance/quick-demo.ts';
import { researchCSV } from '../../lib/finance/research.ts';
import { actionsExport, actionPerformance } from '../../lib/finance/corporate-actions.ts';
import { analyzePortfolio, type PortfolioSnapshot } from '../../lib/finance/historical-portfolio.ts';
import { comparePortfolio, portfolioHistoryCSV } from '../../lib/finance/portfolio-benchmark.ts';
import { initialWorkspace } from '../../lib/finance/demo.ts';
import { csvRows } from '../../lib/finance/market-data.ts';
import { researchCertificate, portfolioCertificate, actionsCertificate, demoPortfolioCertificate, confidenceStatus, withConfidenceCSV } from '../../lib/finance/confidence.ts';
import { publicJob, type Job } from '../../services/research/store.ts';

test('every demo preset has scoped checks and explicitly lacks an independent report receipt',async()=>{
  for(const cost of DEMO_COSTS){const run=await calculateDemo(cost.id),c=researchCertificate(run);
    assert.equal(confidenceStatus(c),'Listed checks passed');assert.equal(c.classification,'Fictional inputs');
    assert.equal(c.coverage.observations,33);assert.equal(c.reference,run.id);
    assert.deepEqual(c.checks.filter(v=>v.status==='not_run').map(v=>v.id),['independent-replay']);
    assert.equal(demoReport(run).confidence.reference,c.reference);assert.deepEqual(demoReport(run).confidence.checks,c.checks);assert.match(demoReport(run).confidence.takeaway,/slippage per trade/);
    assert.ok(c.limitations.some(v=>v.includes('do not replay')));
    const later=researchCertificate(run,'holdout');assert.equal(later.coverage.start,run.snapshot.config.holdoutStart);
    assert.equal(later.coverage.observations,run.analysis.holdout.observations);assert.match(later.subject,/fresh cash/);
    assert.notEqual(later.takeaway,c.takeaway);
  }
});

test('altered wealth, fees, returns, dates and signal timing cannot earn passing certificates',async()=>{
  const original=await calculateDemo();
  const cases:[string,(r:typeof original)=>void][]=[
    ['wealth',r=>{r.analysis.full.strategy.history[2].value='1';}],
    ['fees',r=>{r.analysis.full.strategy.fees='0';}],
    ['returns',r=>{r.analysis.full.strategy.returnPct=99;}],
    ['dates',r=>{r.analysis.full.benchmark.history.pop();}],
    ['timing',r=>{r.analysis.full.strategy.trades[0].signalDate=r.analysis.full.strategy.trades[0].date;}],
  ];
  for(const [id,mutate] of cases){const r=structuredClone(original);mutate(r);const c=researchCertificate(r);
    assert.equal(c.checks.find(v=>v.id===id)?.status,'failed',id);assert.equal(confidenceStatus(c),'Needs review');assert.match(c.takeaway,/consistency check failed/);
  }
});

test('source labels preserve provenance and do not certify a calendar or source authenticity',async()=>{
  const run=await calculateDemo();run.snapshot.asset=structuredClone(run.snapshot.asset);
  run.snapshot.asset.dataset.kind='historical';run.snapshot.asset.dataset.origin='alphavantage';
  run.snapshot.asset.dataset.providerRefreshed='2026-02-23';run.snapshot.asset.dataset.providerTimezone='US/Eastern';
  const c=researchCertificate(run);assert.equal(c.classification,'Contains fictional inputs');
  assert.match(c.sources[0].origin,/2026-02-23.*US\/Eastern/);
  assert.equal(c.coverage.longestGapDays,3);assert.ok(c.limitations.some(v=>v.includes('completeness is not assessed')));
  assert.ok(c.limitations.some(v=>v.includes('not signatures')));
});

async function portfolioFixture(){
  const {snapshot:s}=await calculateDemo();
  const snapshot:PortfolioSnapshot={method:'historical-close-v1',name:'Certificate fixture',asOf:s.config.end,bindings:[s.asset],transactions:[
    {id:'fund',date:s.asset.dataset.firstDate,type:'deposit',symbol:'',units:'0',amount:'100000',fee:'0',reference:''},
    {id:'buy',date:s.asset.dataset.firstDate,type:'buy',symbol:'XDEMO',units:'1000000',amount:'10000',fee:'10',reference:''},
  ],benchmark:{method:'cash-flow-close-v1',binding:s.benchmark}};
  const analysis=analyzePortfolio(snapshot),comparison=comparePortfolio(snapshot,analysis);
  return {snapshot,analysis,comparison};
}
test('portfolio certificate reconciles ledger and benchmark, including failure and cash-only cases',async()=>{
  const {snapshot,analysis,comparison}=await portfolioFixture();
  const c=portfolioCertificate(snapshot,analysis,comparison,'fixture');assert.equal(confidenceStatus(c),'Listed checks passed');
  assert.match(c.takeaway,/net contributions/);assert.match(c.takeaway,/zero-cost/);
  const bad=structuredClone(comparison)!;bad.flows[0].amount='1';
  assert.equal(portfolioCertificate(snapshot,analysis,bad,'fixture').checks.find(v=>v.id==='benchmark')?.status,'failed');
  const changed={...analysis,gain:'999'};assert.equal(confidenceStatus(portfolioCertificate(snapshot,changed,comparison,'fixture')),'Needs review');
  const cash={...snapshot,bindings:[],transactions:snapshot.transactions.slice(0,1),benchmark:undefined};
  const cashCertificate=portfolioCertificate(cash,analyzePortfolio(cash),null,'cash');
  assert.equal(cashCertificate.classification,'Recorded cash flows');assert.equal(confidenceStatus(cashCertificate),'Listed checks passed');
});

test('corporate-action JSON carries source, assumptions and actual endpoint checks',async()=>{
  const {snapshot:{asset}}=await calculateDemo();
  const report=actionsExport(asset.dataset.id,asset.dataset,asset.actions);
  assert.equal(confidenceStatus(report.confidence),'Listed checks passed');assert.equal(report.confidence.classification,'Fictional inputs');
  assert.match(report.confidence.takeaway,/before fees and taxes/);
  const a=actionPerformance(asset.dataset,{source:asset.actions.source,complete:true,events:asset.actions.events});a.cashInclusiveReturnPct=40;
  assert.equal(confidenceStatus(actionsCertificate(asset.dataset,asset.actions,a,'fixture')),'Needs review');
});

test('demo ledger checks use actual ledger balances and supplied quotes',()=>{
  const w=initialWorkspace();assert.equal(confidenceStatus(demoPortfolioCertificate(w)),'Listed checks passed');
  w.analytics.cash+=1;assert.equal(confidenceStatus(demoPortfolioCertificate(w)),'Needs review');
});

test('research and portfolio CSV retain observations and contain the full certificate without formula injection',async()=>{
  const run=await calculateDemo(),{snapshot,analysis,comparison}=await portfolioFixture();
  for(const [csv,c] of [[researchCSV(run),researchCertificate(run)],[portfolioHistoryCSV(analysis,comparison),portfolioCertificate(snapshot,analysis,comparison,'fixture')]] as const){
    const rows=csvRows(withConfidenceCSV(csv,c)),original=csvRows(csv),width=original[0].length;
    assert.deepEqual(rows.map(row=>row.slice(0,width)),original);
    assert.ok(rows.every(row=>row.length===width+2));assert.equal(rows[1][width],c.takeaway);
    assert.deepEqual(JSON.parse(rows[1][width+1]),c);assert.ok(rows.slice(2).every(row=>row[width]===''&&row[width+1]===''));
  }
  const c=researchCertificate(run);c.takeaway='=HYPERLINK("https://example.invalid")';c.sources[0].source='Quoted "source", with comma';
  const rows=csvRows(withConfidenceCSV(researchCSV(run),c));assert.ok(rows[1].at(-2)!.startsWith("'="));
  assert.deepEqual(JSON.parse(rows[1].at(-1)!),c);
});

test('only completed detailed service reports receive a certificate; risk receipt stays separate',async()=>{
  const run=await calculateDemo();
  const job:Job={owner:'test-owner',id:run.id,slot:0,name:run.name,symbol:run.symbol,created:new Date(run.created),updated:new Date(run.created),status:'completed',attempts:1,snapshot:JSON.stringify(run.snapshot),result:JSON.stringify(run.analysis),verification:{engine:'cpp-node-api-v1',comparisons:9,maxAbsoluteError:0}};
  const report=publicJob(job,true);assert.equal(report.confidence?.reference,run.id);assert.deepEqual(report.verification,job.verification);
  assert.equal(report.confidence?.checks.find(v=>v.id==='independent-replay')?.status,'not_run');
  assert.ok(!('confidence' in publicJob(job)));assert.ok(!('confidence' in publicJob({...job,status:'queued',result:undefined},true)));
});
