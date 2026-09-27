import test from 'node:test';
import assert from 'node:assert/strict';
import { latestProviderDatasets } from '../../lib/finance/market-explorer.ts';
import type { DatasetSummary } from '../../lib/finance/market-data.ts';

const snapshot: DatasetSummary = { id: 'a', symbol: 'IBM', source: 'Alpha Vantage', basis: 'raw', priceColumn: 'close', kind: 'historical', currency: 'USD', count: 2, firstDate: '2026-09-14', lastDate: '2026-09-15', created: '2026-09-16T00:00:00Z', origin: 'alphavantage' };

test('explorer excludes CSV claims, fictional observations and other price bases', () => {
  assert.deepEqual(latestProviderDatasets([
    { ...snapshot, origin: 'csv' }, { ...snapshot, origin: undefined },
    { ...snapshot, kind: 'synthetic' }, { ...snapshot, basis: 'split_adjusted' },
    { ...snapshot, priceColumn: 'adjusted_close' },
  ]), []);
});

test('explorer chooses newest observation, with stable save-time and ID ties', () => {
  const newest = { ...snapshot, id: 'newest', lastDate: '2026-09-16' };
  const laterImport = { ...snapshot, id: 'older', created: '2026-09-20T00:00:00Z' };
  const tied = { ...newest, id: 'z' };
  const other = { ...snapshot, symbol: 'NVDA' };
  const candidates = [snapshot, laterImport, newest, tied, other];
  const selected = latestProviderDatasets(candidates);
  assert.deepEqual(selected, [tied, other]);
  assert.deepEqual(latestProviderDatasets([...candidates].reverse()), selected);
  assert.equal(latestProviderDatasets([{ ...newest, created: '2026-09-17T00:00:00Z' }, tied])[0].id, 'newest');
  assert.equal(candidates[0], snapshot);
});

test('browser imports appear in the explorer without changing their source classification', () => {
  const browser = { ...snapshot, origin: 'alphavantage-browser' as const, id: 'browser', lastDate: '2026-09-17' };
  assert.deepEqual(latestProviderDatasets([snapshot, browser]), [browser]);
  assert.equal(browser.origin, 'alphavantage-browser');
});
