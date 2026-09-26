import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDemo, DEMO_COSTS, demoDifference, demoReport } from '../../lib/finance/quick-demo.ts';
import { researchFingerprint } from '../../lib/finance/research.ts';
import { validateResearchSnapshot } from '../../lib/finance/research-input.ts';

test('demo cost comparisons share valid fictional prices, events, cash, dates and rule',async()=>{
  const baseline=await calculateDemo('zero');
  for(const cost of DEMO_COSTS){
    const run=await calculateDemo(cost.id);
    await validateResearchSnapshot(run.snapshot);
    assert.deepEqual(run.snapshot.asset,baseline.snapshot.asset);
    assert.deepEqual(run.snapshot.benchmark,baseline.snapshot.benchmark);
    assert.deepEqual({...run.snapshot.config,feeBps:0,slippageBps:0},baseline.snapshot.config);
    assert.equal(run.analysis.synthetic,true);
    assert.equal(run.snapshot.asset.dataset.symbol,'XDEMO');
    assert.equal(run.snapshot.asset.dataset.kind,'synthetic');
    assert.equal(run.analysis.full.observations,33);
    assert.equal(run.analysis.full.strategy.trades.length,33);
    assert.equal(run.id,await researchFingerprint(run.snapshot));
  }
});

test('cost lesson uses exact cents and exports a reproducible, explicitly unsaved demo',async()=>{
  const zero=await calculateDemo('zero'),normal=await calculateDemo(),higher=await calculateDemo('higher');
  assert.equal(demoDifference(zero,zero),'0');
  assert.equal(zero.analysis.full.strategy.fees,'0');
  const zeroValue=BigInt(zero.analysis.full.strategy.history.at(-1)!.value),normalValue=BigInt(normal.analysis.full.strategy.history.at(-1)!.value),higherValue=BigInt(higher.analysis.full.strategy.history.at(-1)!.value);
  assert.ok(zeroValue>1000000n&&normalValue<1000000n);
  assert.ok(higherValue<normalValue);
  assert.equal(BigInt(demoDifference(zero,normal)),zeroValue-normalValue);
  assert.equal(BigInt(demoDifference(zero,higher)),zeroValue-higherValue);
  const report=JSON.parse(JSON.stringify(demoReport(normal)));
  assert.equal(report.demo.fictional,true);assert.equal(report.demo.savedToWorkspace,false);
  assert.equal(report.format,'marketlab-research-v1');
  assert.deepEqual(report.snapshot,normal.snapshot);assert.deepEqual(report.analysis,normal.analysis);
  assert.deepEqual(await calculateDemo(),normal);
});
