import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResearch, researchFingerprint, type SavedResearch } from '../../lib/finance/research.ts';
import { compareResearch } from '../../lib/finance/research-comparison.ts';
import { researchFixture } from '../fixtures/research.ts';

async function fixture(): Promise<SavedResearch> {
  const snapshot = await researchFixture();
  return { id: await researchFingerprint(snapshot), name: snapshot.config.name, created: '2026-09-24T00:00:00Z', symbol: 'XTEST', benchmark: 'XTEST', start: snapshot.config.start, end: snapshot.config.end, snapshot, analysis: analyzeResearch(snapshot) };
}

test('comparison reads frozen segment results and preserves signed cents and drawdown meaning', async () => {
  const left = await fixture(), right = structuredClone(left);
  right.snapshot.config.window = 3;
  right.analysis.full.strategy.returnPct = left.analysis.full.strategy.returnPct + 2;
  right.analysis.full.strategy.maxDrawdown = left.analysis.full.strategy.maxDrawdown + 1;
  right.analysis.full.strategy.history.at(-1)!.value = '134001';
  right.analysis.full.strategy.fees = '7';
  const before = JSON.stringify([left, right]), result = compareResearch(left, right, 'full');
  assert.equal(result.aligned, true);
  assert.deepEqual(result.delta, { returnPp: 2, drawdownPp: 1, endingValue: '1', fees: '7', trades: 0 });
  assert.deepEqual(result.changes, ['SMA window: 2 → 3 observations']);
  assert.equal(JSON.stringify([left, right]), before);
  assert.equal(compareResearch(right, left, 'full').delta!.endingValue, '-1');
  for (const period of ['development', 'holdout'] as const) {
    const c = compareResearch(left, right, period);
    assert.equal(c.left, left.analysis[period]);
    assert.equal(c.right, right.analysis[period]);
    assert.equal(c.delta!.returnPp, 0);
  }
});

test('same bounds and count do not hide different interior observation dates', async () => {
  const left = await fixture(), right = structuredClone(left);
  right.analysis.full.strategy.history[1].date = '2016-01-04T12:00:00Z';
  const c = compareResearch(left, right, 'full');
  assert.equal(c.delta, null);
  assert.ok(c.differences.some(d => d.startsWith('Observed dates differ')));
});

test('matching dataset IDs do not hide changed prices, corporate actions or benchmark records', async () => {
  const left = await fixture();
  for (const role of ['asset', 'benchmark'] as const) {
    const right = structuredClone(left);
    right.snapshot[role] = structuredClone(right.snapshot[role]);
    right.snapshot[role].actions.events[1].amount = '2';
    const c = compareResearch(left, right, 'full');
    assert.equal(c.delta, null);
    assert.ok(c.differences.includes(`${role === 'asset' ? 'Asset' : 'Benchmark'} split/dividend records differ.`));
  }
  const right = structuredClone(left);
  right.snapshot.asset.dataset.observations[0].priceMicros = '91000000';
  assert.ok(compareResearch(left, right, 'full').differences.includes('Asset price snapshots or provenance differ.'));
});

test('evaluation boundaries, cash and calculation method prevent matched deltas', async () => {
  const left = await fixture();
  for (const change of ['dates', 'cash', 'method']) {
    const right = structuredClone(left);
    if (change === 'dates') right.snapshot.config.holdoutStart = '2016-01-07';
    if (change === 'cash') right.snapshot.config.initialCash = '2400';
    if (change === 'method') Object.assign(right.snapshot, { method: 'future-method' });
    const result = compareResearch(left, right, 'full');
    assert.equal(result.aligned, false);
    assert.equal(result.delta, null);
  }
});

test('intentional fee and slippage variations are identified separately from fixed inputs', async () => {
  const left = await fixture(), right = structuredClone(left);
  right.snapshot.config.feeBps = 15;
  right.snapshot.config.slippageBps = 5;
  const c = compareResearch(left, right, 'full');
  assert.equal(c.aligned, true);
  assert.deepEqual(c.changes, ['Fee: 0 → 15 basis points per trade', 'Slippage: 0 → 5 basis points per trade']);
});

test('names, save timestamps and equivalent dollar notation do not change comparability', async () => {
  const left = await fixture(), right = structuredClone(left);
  right.name = right.snapshot.config.name = 'Renamed';
  right.created = '2026-09-25T00:00:00Z';
  right.snapshot.asset.actions.updated = '2026-09-25T00:00:00Z';
  right.snapshot.config.initialCash = '1200.00';
  const c = compareResearch(left, right, 'full');
  assert.equal(c.aligned, true);
  assert.deepEqual(c.changes, []);
});
