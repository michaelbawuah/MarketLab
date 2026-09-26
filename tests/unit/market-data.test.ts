import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImport, datasetId, datasetCSV, priceDecimal, seriesStats, exampleDraft, MAX_CSV_BYTES, type SavedDataset } from '../../lib/finance/market-data.ts';

const draft = { ...exampleDraft, csv: 'date,close\n2026-09-14,100.123456\n2026-09-15,125\n2026-09-18,100' };
const parse = (csv: string) => validateImport({ ...draft, csv }, '2026-09-25');
test('prices preserve six decimals and are ordered by observed date without inventing sessions', () => {
  const d = parse('timestamp,open,close,volume\n2026-09-18,99,100,20\n2026-09-14,100,100.123456,12');
  assert.deepEqual(d.observations, [{ date: '2026-09-14', priceMicros: '100123456' }, { date: '2026-09-18', priceMicros: '100000000' }]);
  assert.equal(priceDecimal('123450001'), '123.450001');
});
test('canonical identity makes reordered exact replays idempotent and corrections distinct', async () => {
  const a = parse('date,close\n2026-09-14,100.1000\n2026-09-15,101');
  const b = parse('\uFEFF"Date","Close"\r\n"2026-09-15","101.000000"\r\n"2026-09-14","100.1"\r\n');
  assert.equal(await datasetId(a), await datasetId(b));
  assert.notEqual(await datasetId(a), await datasetId({ ...b, source: 'A different source' }));
  assert.notEqual(await datasetId(a), await datasetId({ ...b, basis: 'split_adjusted' }));
  assert.notEqual(await datasetId(a), await datasetId({ ...b, observations: [{ date: '2026-09-14', priceMicros: '100200000' }, b.observations[1]] }));
});
test('invalid or future dates, duplicates, non-USD and mixed symbols fail before persistence', () => {
  for (const date of ['2026-02-30', '2025-02-29', '09/14/2026', '2026-09-26']) assert.throws(() => parse(`date,close\n${date},100\n2026-09-15,101`), /date/i);
  assert.throws(() => parse('date,close\n2026-09-14,100\n2026-09-14,101'), /duplicate date/);
  assert.throws(() => parse('date,close,currency\n2026-09-14,100,EUR\n2026-09-15,101,EUR'), /USD/);
  assert.throws(() => parse('date,close,symbol\n2026-09-14,100,WRONG\n2026-09-15,101,WRONG'), /symbol/);
});
test('invalid prices never round or coerce silently', () => {
  for (const v of ['0', '-1', 'NaN', 'Infinity', '1e2', '1.0000001', '$10', '1000000.000001']) assert.throws(() => parse(`date,close\n2026-09-14,${v}\n2026-09-15,101`), /price/i);
});
test('CSV quoting and aliases are supported while ambiguous structures are rejected', () => {
  assert.equal(parse('date,close,note\n2026-09-14,100,"a, b"\n2026-09-15,101,"two ""quotes"""').observations.length, 2);
  for (const csv of ['date,close\n2026-09-14,"100\n2026-09-15,101', 'date,close\n2026-09-14,"100"oops\n2026-09-15,101', 'date,timestamp,close\n2026-09-14,2026-09-14,100\n2026-09-15,2026-09-15,101', 'date,close\n2026-09-14,100,extra\n2026-09-15,101']) assert.throws(() => parse(csv));
  assert.throws(() => parse('x'.repeat(MAX_CSV_BYTES + 1)), /256 KiB/);
  assert.throws(() => parse('date,close\n' + '2026-09-14,100\n'.repeat(2501)), /2,500/);
});
test('explicit adjusted column selection cannot silently use raw close or claim unadjusted', () => {
  const input = { ...draft, basis: 'total_return_adjusted', priceColumn: 'adjusted_close', csv: 'Date,Close,Adj Close\n2026-09-14,100,80.1234\n2026-09-15,102,81' };
  const d = validateImport(input, '2026-09-25'); assert.equal(d.observations[0].priceMicros, '80123400');
  assert.throws(() => validateImport({ ...input, basis: 'raw' }), /unadjusted/);
  assert.throws(() => validateImport({ ...input, csv: draft.csv }), /adjusted_close columns/);
  assert.throws(() => validateImport({ ...draft, owner: 'someone-else' }), /fields/);
});
test('series metrics match an independent hand calculation with observed date gaps', () => {
  const d = validateImport(draft, '2026-09-25');
  const r = seriesStats(d.observations);
  assert.ok(Math.abs(r.changePct - (100 / 100.123456 - 1) * 100) < 1e-10);
  assert.equal(r.drawdownPct, -20); assert.equal(r.longestGapDays, 3);
  assert.equal(seriesStats(parse('date,close\n2026-09-14,100\n2026-09-15,100').observations).drawdownPct, 0);
});
test('export keeps exact decimals and metadata and neutralizes spreadsheet formulas', async () => {
  const d = validateImport({ ...draft, source: '=HYPERLINK("https://example.org")' }, '2026-09-25');
  const saved: SavedDataset = { ...d, id: await datasetId(d), count: 3, firstDate: '2026-09-14', lastDate: '2026-09-18', created: '2026-09-25T00:00:00Z' };
  const csv = datasetCSV(saved);
  assert.match(csv, /100\.123456/); assert.match(csv, /"'=HYPERLINK/); assert.ok(csv.includes(saved.id));
  assert.deepEqual(validateImport({ ...draft, csv }, '2026-09-25').observations, d.observations);
});
