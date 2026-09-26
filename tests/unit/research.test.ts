import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImport, datasetId } from '../../lib/finance/market-data.ts';
import { validateActions } from '../../lib/finance/corporate-actions.ts';
import { analyzeResearch, observedMetrics, researchFingerprint, researchCSV, validateResearchDraft, RESEARCH_METHOD, type ResearchSnapshot } from '../../lib/finance/research.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} differs from ${b}`);
async function fixture():Promise<ResearchSnapshot> {
  const prices=[90,100,120,60,55,65,50,60],dates=prices.map((_,i)=>`2026-09-${String(10+i).padStart(2,'0')}`);
  const d=validateImport({symbol:'XTEST',source:'Independent fictional research fixture',basis:'raw',priceColumn:'close',kind:'synthetic',csv:'date,close\n'+prices.map((p,i)=>`${dates[i]},${p}`).join('\n')},'2026-09-24');
  const dataset={...d,id:await datasetId(d),firstDate:dates[0],lastDate:dates.at(-1)!,count:8,created:'2026-09-24'};
  const actions={...validateActions({source:'Fictional split and dividend',complete:true,events:[{date:dates[3],type:'split',newShares:'2',oldShares:'1',amount:''},{date:dates[4],type:'dividend',newShares:'',oldShares:'',amount:'1'}]},dataset),revision:1,updated:'2026-09-24'};
  return {method:RESEARCH_METHOD,config:{name:'Independent fixture',assetId:dataset.id,benchmarkId:dataset.id,start:dates[2],end:dates[7],holdoutStart:dates[5],window:2,initialCash:'1200',feeBps:0,slippageBps:0,confirmed:true},asset:{dataset,actions},benchmark:{dataset,actions}};
}
test('independent SMA fixture covers next-close execution, splits, dividends and final pending signal',async()=>{
  const r=analyzeResearch(await fixture()).full;
  assert.deepEqual(r.strategy.history.map(p=>p.value),['120000','120000','112000','112000','112000','134000']);
  assert.deepEqual(r.buyHold.history.map(p=>p.value),['120000','120000','112000','132000','102000','122000']);
  assert.deepEqual(r.strategy.trades.map(t=>[t.signalDate,t.date,t.side,t.shares]),[['2026-09-11','2026-09-12','buy','10'],['2026-09-13','2026-09-14','sell','20'],['2026-09-15','2026-09-16','buy','22'],['2026-09-16','2026-09-17','sell','22']]);
  near(r.strategy.returnPct,11.6666666666667);near(r.strategy.maxDrawdown,-6.6666666666667);near(r.buyHold.returnPct,1.6666666666667);near(r.buyHold.maxDrawdown,-22.72727272727);
  assert.equal(r.strategy.history.at(-1)!.receivables,'2000');
});
test('later period restarts with initial cash, no carried shares or receivables',async()=>{
  const r=analyzeResearch(await fixture()).holdout;
  assert.equal(r.strategy.history[0].value,'120000');assert.equal(r.strategy.history[0].receivables,'0');
  assert.equal(r.strategy.trades[0].shares,'24');assert.equal(r.strategy.history.at(-1)!.value,'144000');
});
test('signals and executions before a cutoff do not change when later prices or events change',async()=>{
  const s=await fixture(),before=analyzeResearch(s).full.strategy;
  s.asset.dataset.observations.at(-1)!.priceMicros='90000000';
  s.asset.actions.events.push({date:'2026-09-17',type:'split',newShares:'3',oldShares:'1',amount:''});
  const after=analyzeResearch(s).full.strategy;
  assert.deepEqual(after.history.slice(0,-1),before.history.slice(0,-1));
  assert.deepEqual(after.trades.filter(t=>t.date<'2026-09-17'),before.trades.filter(t=>t.date<'2026-09-17'));
});
test('trade costs, affordable sizing and drawdown include first-close friction',async()=>{
  const s=await fixture();s.config.initialCash='1020.10';s.config.feeBps=100;s.config.slippageBps=100;
  s.asset.actions.events=[];s.asset.dataset.observations.forEach((p,i)=>p.priceMicros=String([90,100,100,100,100,100,100,100][i]*1e6));
  const r=analyzeResearch(s).full;
  assert.deepEqual(r.strategy.trades.slice(0,2).map(t=>[t.side,t.shares,t.fillMicros,t.gross,t.fee]),[['buy','10','101000000','101000','1010'],['sell','10','99000000','99000','990']]);
  assert.equal(r.strategy.history.at(-1)!.cash,'98010');near(r.strategy.returnPct,-3.921184197627684);
  assert.ok(r.strategy.history.every(p=>BigInt(p.cash)>=0n));near(r.buyHold.maxDrawdown,(100000/102010-1)*100);
});
test('reverse split fractions sell completely and ex-date buyers receive no entitlement',async()=>{
  const s=await fixture();s.asset.actions.events[0].newShares='1';s.asset.actions.events[0].oldShares='3';
  s.asset.dataset.observations[3].priceMicros='360000000';
  const r=analyzeResearch(s).full.strategy;
  assert.equal(r.trades[1].shares,'10/3');assert.equal(r.history[2].shares,'0');assert.equal(r.history[2].receivables,'333');
  const a=await fixture();a.asset.actions.events=[{date:a.config.start,type:'dividend',newShares:'',oldShares:'',amount:'10'}];
  assert.equal(analyzeResearch(a).full.strategy.history[0].receivables,'0');
});
test('matched date grid, raw prices, warmup and segment size are required',async()=>{
  const s=await fixture();s.benchmark=structuredClone(s.benchmark);s.benchmark.dataset.observations.splice(3,1);assert.throws(()=>analyzeResearch(s),/identical observation dates/);
  const a=await fixture();a.asset.dataset.basis='split_adjusted';assert.throws(()=>analyzeResearch(a),/unadjusted/);
  const b=await fixture();b.config.window=3;assert.throws(()=>analyzeResearch(b),/Insufficient observations/);
  const c=await fixture();c.config.holdoutStart='2026-09-16';assert.throws(()=>analyzeResearch(c),/at least three/);
  const d=await fixture();d.config.confirmed=false;assert.throws(()=>validateResearchDraft(d.config),/Confirm/);
});
test('risk agrees with independent arithmetic, including zero-variance cases',()=>{
  const r=observedMetrics([100,110,99,118.8],[100,105,99.75,109.725]);near(r.volatilityPct!,15.27525231651947);near(r.sharpe!,.436435780471985);near(r.beta!,2);near(r.correlation!,1);
  const flat=observedMetrics([100,100,100],[100,110,99]);assert.deepEqual(flat,{intervals:2,volatilityPct:0,sharpe:null,beta:0,correlation:null});
  const b=observedMetrics([100,110,99],[100,100,100]);near(b.volatilityPct!,14.14213562373);assert.equal(b.beta,null);assert.equal(b.correlation,null);
  assert.equal(observedMetrics([100,110],[100,105]).volatilityPct,null);
});
test('snapshot identity changes with full event payload and JSON reproduces the result; CSV preserves exact cents',async()=>{
  const s=await fixture(),first=await researchFingerprint(s),analysis=analyzeResearch(s);
  assert.deepEqual(analyzeResearch(JSON.parse(JSON.stringify(s))),analysis);
  const csv=researchCSV({id:first,name:s.config.name,created:'2026-09-24',symbol:'XTEST',benchmark:'XTEST',start:s.config.start,end:s.config.end,snapshot:s,analysis});
  assert.ok(csv.includes('full,2026-09-17,1340.00,1220.00,1220.00,1320.00,20.00'));
  s.asset.actions.events[1].amount='2';assert.notEqual(await researchFingerprint(s),first);
});
