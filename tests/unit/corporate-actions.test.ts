import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImport } from '../../lib/finance/market-data.ts';
import { validateActions, actionPerformance, actionsExport, type ActionDraft } from '../../lib/finance/corporate-actions.ts';
const data = (csv: string, basis = 'raw') => validateImport({ symbol: 'TEST', source: 'Test fixture', basis, kind: 'synthetic', priceColumn: 'close', csv }, '2026-09-24');
const split = (date: string, newShares = '2', oldShares = '1'): ActionDraft => ({ date, type: 'split', newShares, oldShares, amount: '' });
const dividend = (date: string, amount = '2'): ActionDraft => ({ date, type: 'dividend', newShares: '', oldShares: '', amount });
const set = (events: ActionDraft[]) => ({ source: 'Fictional test events', complete: true, events });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('forward and reverse splits preserve wealth and exact fractional shares', () => {
  const a = actionPerformance(data('date,close\n2026-09-01,100\n2026-09-02,50'), set([split('2026-09-02')]));
  close(a.priceReturnPct, -50); close(a.splitReturnPct, 0); close(a.cashInclusiveReturnPct, 0); assert.equal(a.shares, '2/1');
  const b = actionPerformance(data('date,close\n2026-09-01,100\n2026-09-02,300'), set([split('2026-09-02', '1', '3')]));
  close(b.cashInclusiveReturnPct, 0); assert.equal(b.shares, '1/3');
});
test('cash dividend offsets ex-date drop and is not reinvested', () => {
  const a = actionPerformance(data('date,close\n2026-09-01,100\n2026-09-02,98\n2026-09-03,100'), set([dividend('2026-09-02')]));
  close(a.history[1].wealthIndex, 100); close(a.cashInclusiveReturnPct, 2); assert.equal(a.shares, '1/1'); close(a.incomePerInitialShare, 2);
});
test('same-day split precedes dividend; prior income does not split', () => {
  const a = actionPerformance(data('date,close\n2026-09-01,100\n2026-09-02,98\n2026-09-03,48'), set([dividend('2026-09-03', '1'), split('2026-09-03'), dividend('2026-09-02')]));
  close(a.incomePerInitialShare, 4); close(a.cashInclusiveReturnPct, 0); close(a.drawdownPct, 0);
});
test('events between supplied observations apply chronologically without invented prices', () => {
  const a = actionPerformance(data('date,close\n2026-09-01,100\n2026-09-07,48'), set([split('2026-09-03'), dividend('2026-09-04')]));
  assert.equal(a.history.length, 2); close(a.cashInclusiveReturnPct, 0);
});
test('rejects adjusted inputs, incomplete coverage, invalid dates and duplicate events', () => {
  const d = data('date,close\n2026-09-01,100\n2026-09-04,98');
  for (const basis of ['split_adjusted','total_return_adjusted','unknown']) assert.throws(() => validateActions(set([]), { ...d, basis: basis as typeof d.basis }), /unadjusted/);
  assert.throws(() => validateActions({ ...set([]), complete: false }, d), /confirm/);
  for (const date of ['2026-09-01','2026-09-05','2026-02-30','garbage']) assert.throws(() => validateActions(set([dividend(date)]), d), /date must/);
  assert.throws(() => validateActions(set([dividend('2026-09-02'), dividend('2026-09-02')]), d), /duplicate/);
  assert.throws(() => validateActions(set([split('2026-09-02', '0')]), d), /whole-number/);
  assert.throws(() => validateActions(set([dividend('2026-09-02','1.0000001')]), d), /six places/);
  assert.throws(() => validateActions(set(Array.from({ length: 101 }, () => dividend('2026-09-02'))), d), /at most 100/);
});
test('explicit no-event coverage and audit export reconcile with original observations', () => {
  const d = data('date,close\n2026-09-01,100\n2026-09-02,90\n2026-09-03,95');
  const a = actionPerformance(d, set([])); close(a.cashInclusiveReturnPct, -5); close(a.drawdownPct, -10);
  const exported = actionsExport('test', d, { ...validateActions(set([]),d), revision: 1, updated:'2026-09-24' });
  assert.deepEqual(exported.observations, d.observations); assert.equal(exported.assumptions.reinvestment, false);
});
