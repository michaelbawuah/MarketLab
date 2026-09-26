import test from 'node:test';
import assert from 'node:assert/strict';
import { equityEvents,groupEquityEvents,type EquityEvent } from '../../lib/finance/equity-events.ts';
import { analyzeResearch } from '../../lib/finance/research.ts';
import { researchFixture } from '../fixtures/research.ts';

test('markers explain actual executions, split holdings and ex-date income in engine order',async()=>{
  const s=await researchFixture(),part=analyzeResearch(s).full,before=JSON.stringify(part),events=equityEvents(part,s.asset.actions.events,s.config.initialCash);
  assert.deepEqual(events.map(e=>e.kind),['start','buy','split','dividend','sell','buy','sell']);
  assert.match(events[1].detail,/Signal from 2016-01-02 executes/);assert.match(events[1].detail,/10 shares at \$120\.000000/);
  assert.match(events[2].detail,/from 10 to 20/);assert.equal(events[3].title,'$20.00 dividend entitlement');
  assert.match(events[3].detail,/not spendable cash/);assert.equal(JSON.stringify(part),before);
  assert.ok(events.every(e=>part.strategy.history[e.pointIndex].date===e.observedDate));
});
test('events between supplied closes preserve effective dates and anchor at the next real observation',async()=>{
  const s=await researchFixture();s.asset.dataset.observations.forEach((p,i)=>p.date=`2016-01-${String(1+i*2).padStart(2,'0')}`);
  s.asset.actions.events[0].date='2016-01-06';s.asset.actions.events[1].date='2016-01-08';
  s.config.start='2016-01-05';s.config.holdoutStart='2016-01-11';s.config.end='2016-01-15';
  const part=analyzeResearch(s).full,events=equityEvents(part,s.asset.actions.events,s.config.initialCash);
  assert.deepEqual(events.filter(e=>e.kind==='split'||e.kind==='dividend').map(e=>[e.date,e.observedDate]),[['2016-01-06','2016-01-07'],['2016-01-08','2016-01-09']]);
  assert.equal(events.find(e=>e.kind==='dividend')!.title,'$20.00 dividend entitlement');
});
test('same-day split precedes entitlement, with exact reverse-split fractions',async()=>{
  const s=await researchFixture();s.asset.actions.events[0].newShares='1';s.asset.actions.events[0].oldShares='3';
  s.asset.actions.events[1].date=s.asset.actions.events[0].date;s.asset.actions.events.reverse();
  s.asset.dataset.observations[3].priceMicros='360000000';
  const events=equityEvents(analyzeResearch(s).full,s.asset.actions.events,s.config.initialCash);
  assert.deepEqual(events.filter(e=>e.date==='2016-01-04').map(e=>e.kind),['split','dividend']);
  assert.match(events.find(e=>e.kind==='split')!.detail,/from 10 to 10\/3/);assert.equal(events.find(e=>e.kind==='dividend')!.title,'$3.33 dividend entitlement');
});
test('later-period markers restart in cash and exclude first-day and earlier entitlements',async()=>{
  const s=await researchFixture();s.asset.actions.events.push({date:s.config.holdoutStart,type:'dividend',amount:'10',newShares:'',oldShares:''});
  const events=equityEvents(analyzeResearch(s).holdout,s.asset.actions.events,s.config.initialCash);
  assert.equal(events[0].date,s.config.holdoutStart);assert.equal(events.filter(e=>e.kind==='dividend'||e.kind==='split').length,0);
  assert.match(events[0].detail,/No shares or dividend receivables carry/);
});
test('trade annotations preserve cent fees and micro-dollar fills after slippage',async()=>{
  const s=await researchFixture();s.config.initialCash='1020.10';s.config.feeBps=100;s.config.slippageBps=100;
  s.asset.actions.events=[];s.asset.dataset.observations.forEach((p,i)=>p.priceMicros=String([90,100,100,100,100,100,100,100][i]*1e6));
  const events=equityEvents(analyzeResearch(s).full,[],s.config.initialCash);
  assert.match(events.find(e=>e.kind==='buy')!.detail,/10 shares at \$101\.000000; \$1010\.00 gross and \$10\.10 fee/);
  assert.match(events.find(e=>e.kind==='sell')!.detail,/\$990\.00 gross and \$9\.90 fee/);
});
test('responsive marker grouping preserves all 1,000 events in chronological order',()=>{
  const events:EquityEvent[]=Array.from({length:1000},(_,i)=>{const date=new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10);return {id:`buy:${i}`,kind:'buy',date,observedDate:date,pointIndex:i,title:'Buy',detail:'Fictional grouping input'};});
  for(const slots of [2,6,12,24]){const groups=groupEquityEvents(events,events[0].date,events.at(-1)!.date,slots);assert.ok(groups.length<=slots);assert.deepEqual(groups.flatMap(g=>g.events),events);}
  assert.throws(()=>groupEquityEvents(events,events[0].date,events.at(-1)!.date,1),/At least two/);
});
