import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImport, datasetId, type SavedDataset } from '../../lib/finance/market-data.ts';
import { analyzePortfolio, parseLedger, LEDGER_HEADER, PORTFOLIO_METHOD, portfolioFingerprint, validatePortfolioDraft, type PortfolioSnapshot } from '../../lib/finance/historical-portfolio.ts';
import { validateActions, type ActionDraft } from '../../lib/finance/corporate-actions.ts';
import { BENCHMARK_METHOD, comparePortfolio, portfolioHistoryCSV } from '../../lib/finance/portfolio-benchmark.ts';
const dates = ['2026-09-14','2026-09-15','2026-09-16','2026-09-17'];
const split: ActionDraft = {date:dates[1],type:'split',newShares:'2',oldShares:'1',amount:''};
const dividend: ActionDraft = {date:dates[2],type:'dividend',newShares:'',oldShares:'',amount:'1'};
async function fixture(prices=['100','50','49','55'], rows=[`d1,${dates[0]},deposit,,0,1000,0,`,`d2,${dates[1]},deposit,,0,200,0,`,`w1,${dates[2]},withdrawal,,0,196,0,`], events:ActionDraft[]=[split,dividend]):Promise<PortfolioSnapshot> {
  const d=validateImport({symbol:'XBENCH',source:'Independent fictional benchmark',basis:'raw',priceColumn:'close',kind:'synthetic',csv:'date,close\n'+prices.map((p,i)=>`${dates[i]},${p}`).join('\n')},'2026-09-25');
  const dataset:SavedDataset={...d,id:await datasetId(d),count:prices.length,firstDate:dates[0],lastDate:dates[prices.length-1],created:'2026-09-25T00:00:00Z'};
  const actions={...validateActions({source:'Independent fictional events',complete:true,events},dataset),revision:1,updated:'2026-09-25T00:00:00Z'};
  // Cash-only reference portfolio still has the complete shared valuation grid.
  return {method:PORTFOLIO_METHOD,name:'Cash-flow comparison',asOf:dataset.lastDate,transactions:parseLedger(LEDGER_HEADER+'\n'+rows.join('\n'),dataset.lastDate),bindings:[{dataset,actions}],benchmark:{method:BENCHMARK_METHOD,binding:{dataset,actions}}};
}
const run=(s:PortfolioSnapshot)=>comparePortfolio(s,analyzePortfolio(s))!;
test('matched flows reconcile independently through split, dividend and withdrawal',async()=>{
  const s=await fixture(),r=run(s);
  assert.deepEqual(r.history.map(p=>[p.shares,p.value,p.receivables]),[['10','100000','0'],['24','120000','0'],['20','100400','2400'],['20','112400','2400']]);
  assert.deepEqual([r.contributions,r.gain,r.valueDifference,r.maxDrawdown],['100400','12000','-12000',0]);
  assert.ok(Math.abs(r.returnPct-11.95219123505976)<1e-10);
  assert.ok(Math.abs(r.returnDifferencePp+11.95219123505976)<1e-10);
});
test('internal trades, trade fees and portfolio dividend payments never fund the benchmark',async()=>{
  const a=await fixture(),expected=run(a);
  const rows=[`d1,${dates[0]},deposit,,0,1000,0,`,`b1,${dates[0]},buy,XBENCH,4,400,1,`,`d2,${dates[1]},deposit,,0,200,0,`,`w1,${dates[2]},withdrawal,,0,196,0,`,`s1,${dates[2]},sell,XBENCH,2,98,1,`,`p1,${dates[3]},dividend_payment,XBENCH,0,8,0,${dates[2]}`];
  const b=await fixture(undefined,rows),actual=run(b);
  assert.equal(actual.value,expected.value);assert.deepEqual(actual.flows,expected.flows);assert.deepEqual(actual.dividends,expected.dividends);assert.equal(actual.returnPct,expected.returnPct);
  assert.notEqual(actual.valueDifference,expected.valueDifference);
});
test('between-observation actions accrue without inventing portfolio dates',async()=>{
  const s=await fixture(['100','50','55'],[`d1,${dates[0]},deposit,,0,1000,0,`,`d2,${dates[2]},deposit,,0,220,0,`],[split,{...dividend,date:dates[1]}]);
  s.bindings=[]; // Actual portfolio is cash-only and observes D1 and D3 only.
  const r=run(s);assert.deepEqual(r.history.map(p=>p.date),[dates[0],dates[2]]);
  assert.deepEqual([r.shares,r.value,r.receivables,r.contributions,r.gain],['24','134000','2000','122000','12000']);assert.ok(Math.abs(r.returnPct-12)<1e-10);
});
test('same-date funding order matters and insufficient benchmark withdrawals fail closed',async()=>{
  const d1=`d1,${dates[0]},deposit,,0,1000,0,`,w=`w1,${dates[1]},withdrawal,,0,600,0,`,d2=`d2,${dates[1]},deposit,,0,200,0,`;
  const bad=await fixture(['100','50'],[d1,w,d2],[]);assert.throws(()=>run(bad),/withdrawal w1.*spendable holdings/);
  const good=await fixture(['100','50'],[d1,d2,w],[]),r=run(good);assert.equal(r.value,'10000');assert.equal(r.shares,'2');assert.equal(r.returnPct,-50);
});
test('withdrawal of rounded holdings liquidates exactly, and unpaid dividends remain unspendable',async()=>{
  const small=await fixture(['0.03','0.02'],[`d1,${dates[0]},deposit,,0,0.01,0,`,`w1,${dates[1]},withdrawal,,0,0.01,0,`],[]);
  assert.equal(run(small).shares,'0');assert.equal(run(small).value,'0');
  const s=await fixture(['100','50','49'],[`d1,${dates[0]},deposit,,0,1000,0,`,`w1,${dates[2]},withdrawal,,0,980,0,`]);
  const r=run(s);assert.equal(r.shares,'0');assert.equal(r.receivables,'2000');assert.equal(r.value,'2000');
  s.transactions.push({...s.transactions[1],id:'w2',amount:'1'});assert.throws(()=>run(s),/withdrawal w2.*Unpaid dividends/);
});
test('missing exact marks, coverage gaps, adjusted prices and unsupported versions reject comparison',async()=>{
  const s=await fixture();s.benchmark!.binding=structuredClone(s.benchmark!.binding);s.benchmark!.binding.dataset.observations.splice(1,1);assert.throws(()=>run(s),/missing exact close/);
  const t=await fixture();t.benchmark!.binding.dataset.firstDate=dates[1];assert.throws(()=>run(t),/coverage must include/);
  const u=await fixture();u.benchmark!.binding.dataset.basis='split_adjusted';assert.throws(()=>run(u),/unadjusted/);
  const v=await fixture();(v.benchmark as {method:string}).method='future';assert.throws(()=>run(v),/Unsupported/);
});
test('sub-cent recoverable holdings cannot silently become a permanent total-loss return',async()=>{
  const s=await fixture(['3','1','3'],[`d1,${dates[0]},deposit,,0,0.01,0,`,`d2,${dates[1]},deposit,,0,0.01,0,`],[]);
  assert.throws(()=>run(s),/below one cent.*recoverable/);
});
test('large rational-share audit output stops before exceeding the response budget',async()=>{
  const s=await fixture();s.bindings=[];
  const observations=Array.from({length:500},(_,i)=>({date:new Date(Date.UTC(2016,0,1+i)).toISOString().slice(0,10),priceMicros:String(100000001+i)}));
  const d=s.benchmark!.binding.dataset;Object.assign(d,{observations,count:500,firstDate:observations[0].date,lastDate:observations.at(-1)!.date});
  s.benchmark!.binding.actions.events=[];s.asOf=d.lastDate;
  s.transactions=observations.map((p,i)=>({id:`deposit-${i}`,date:p.date,type:'deposit',symbol:'',units:'0',amount:'100',fee:'0',reference:''}));
  assert.throws(()=>run(s),/audit exceeds 1 MiB/);
});
test('legacy portfolio results and fingerprints are unchanged, while frozen benchmark edits change identity',async()=>{
  const s=await fixture(),legacy=structuredClone(s);delete legacy.benchmark;
  const before=JSON.stringify(legacy),id=await portfolioFingerprint(legacy),a=analyzePortfolio(legacy);
  assert.equal(comparePortfolio(legacy,a),null);assert.deepEqual(analyzePortfolio(s),a);assert.equal(JSON.stringify(legacy),before);assert.equal(await portfolioFingerprint(legacy),id);
  const frozen=await portfolioFingerprint(s);s.benchmark!.binding.actions.revision++;assert.notEqual(await portfolioFingerprint(s),frozen);
});
test('optional benchmark draft validation and CSV export preserve exact cents and matched rows',async()=>{
  const s=await fixture();const d={name:'Cash only',asOf:dates[3],csv:LEDGER_HEADER+`\nd1,${dates[0]},deposit,,0,1000,0,`,bindings:[],confirmed:true};
  assert.equal(validatePortfolioDraft(d).benchmarkDatasetId,undefined);
  assert.equal(validatePortfolioDraft({...d,benchmarkDatasetId:s.benchmark!.binding.dataset.id}).benchmarkDatasetId,s.benchmark!.binding.dataset.id);
  assert.throws(()=>validatePortfolioDraft({...d,benchmarkDatasetId:null}),/benchmark dataset/);
  assert.throws(()=>validatePortfolioDraft({...d,benchmarkDatasetId:'forged'}),/benchmark dataset/);
  const a=analyzePortfolio(s),csv=portfolioHistoryCSV(a,comparePortfolio(s,a)),rows=csv.split('\r\n').map(r=>r.split(','));
  assert.equal(rows.length,a.history.length+1);assert.deepEqual(rows.at(-1)!.slice(0,5),[dates[3],'100400','100400','100400','0']);assert.equal(rows.at(-1)![6],'112400');assert.equal(rows.at(-1)![9],'-12000');assert.equal(rows.at(-1)![13],'true');
});
