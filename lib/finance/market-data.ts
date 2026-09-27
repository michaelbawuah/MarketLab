import { parseDecimal } from './core.ts';

export const MAX_CSV_BYTES = 256 * 1024;
export const MAX_OBSERVATIONS = 2500;
export const MAX_DATASETS = 30;
export const basisLabels = { raw: 'Unadjusted', split_adjusted: 'Split-adjusted', total_return_adjusted: 'Dividend + split-adjusted', unknown: 'Unknown adjustment' };
export type PriceBasis = keyof typeof basisLabels;
export type ImportDraft = { symbol: string; source: string; basis: PriceBasis; priceColumn: 'close' | 'adjusted_close'; kind: 'historical' | 'synthetic'; csv: string };
export type Observation = { date: string; priceMicros: string };
export type DatasetInput = Omit<ImportDraft, 'csv'> & { currency: 'USD'; observations: Observation[] };
export type DatasetSummary = Omit<DatasetInput, 'observations'> & { id: string; count: number; firstDate: string; lastDate: string; created: string; origin?: 'csv' | 'alphavantage' | 'alphavantage-browser'; providerRefreshed?: string | null; providerTimezone?: string | null };
export type SavedDataset = DatasetSummary & { observations: Observation[] };

/** Bounded RFC-style CSV reader. Reject ambiguous quoting instead of repairing data. */
export function csvRows(csv: string): string[][] {
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) throw new Error('CSV must be 256 KiB or smaller.');
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell.trim()); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); if (row.some(c => c !== '')) rows.push(row); row = []; if (rows.length > MAX_OBSERVATIONS + 1) throw new Error(`Use at most ${MAX_OBSERVATIONS.toLocaleString()} observations.`); };
  const text = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === ',') finishCell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (c === '"') { if (cell || closed) throw new Error('Malformed CSV quoting. Use comma-separated fields.'); quoted = true; }
    else { if (closed) { if (c !== ' ' && c !== '\t') throw new Error('Unexpected text after a quoted CSV field.'); } else cell += c; }
    if (row.length > 32 || cell.length > 4096) throw new Error('CSV has too many columns or an oversized field.');
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cell || row.length || closed) finishRow();
  return rows;
}

export function validateImport(input: unknown, today = new Date().toISOString().slice(0, 10)): DatasetInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a CSV import.');
  const d = input as Record<string, unknown>;
  const fields = ['symbol', 'source', 'basis', 'priceColumn', 'kind', 'csv'];
  if (Object.keys(d).some(k => !fields.includes(k)) || fields.some(k => typeof d[k] !== 'string')) throw new Error('CSV import fields are invalid.');
  const symbol = (d.symbol as string).trim().toUpperCase(), source = (d.source as string).trim();
  if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)) throw new Error('Enter one valid symbol, such as AAPL or BRK.B.');
  if (source.length < 3 || source.length > 160 || /[\u0000-\u001f\u007f]/.test(source)) throw new Error('Enter a source name of 3–160 characters.');
  if (!Object.hasOwn(basisLabels, d.basis as string)) throw new Error('Choose the price adjustment basis.');
  if (!['close', 'adjusted_close'].includes(d.priceColumn as string)) throw new Error('Choose the CSV price column.');
  if (!['historical', 'synthetic'].includes(d.kind as string)) throw new Error('Choose historical or synthetic data.');
  if (d.priceColumn === 'adjusted_close' && d.basis === 'raw') throw new Error('Adjusted close cannot be labeled unadjusted. Choose its documented adjustment or Unknown.');
  const rows = csvRows(d.csv as string);
  if (rows.length < 3) throw new Error('Include a header and at least two dated observations.');
  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_')).map(h => h === 'timestamp' ? 'date' : h === 'adj_close' ? 'adjusted_close' : h);
  if (new Set(headers).size !== headers.length) throw new Error('CSV has duplicate column names.');
  const dateIndex = headers.indexOf('date'), priceIndex = headers.indexOf(d.priceColumn as string), symbolIndex = headers.indexOf('symbol');
  if (dateIndex < 0 || priceIndex < 0) throw new Error(`CSV needs date (or timestamp) and ${d.priceColumn} columns.`);
  const seen = new Set<string>();
  const observations = rows.slice(1).map((row, i) => {
    const label = `Record ${i + 1}`;
    if (row.length !== headers.length) throw new Error(`${label}: column count does not match the header.`);
    const date = row[dateIndex];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error(`${label}: use a valid date in YYYY-MM-DD format.`);
    if (date > today) throw new Error(`${label}: future dates cannot be imported as observations.`);
    if (seen.has(date)) throw new Error(`${label}: duplicate date ${date}. Resolve duplicates before importing.`);
    seen.add(date);
    if (symbolIndex >= 0 && row[symbolIndex].toUpperCase() !== symbol) throw new Error(`${label}: symbol does not match ${symbol}. Import one symbol at a time.`);
    const currencyIndex = headers.indexOf('currency');
    if (currencyIndex >= 0 && row[currencyIndex].toUpperCase() !== 'USD') throw new Error(`${label}: only USD price datasets are supported.`);
    let price: bigint;
    try { price = parseDecimal(row[priceIndex], 6); } catch { throw new Error(`${label}: price must be a decimal with at most six decimal places; no currency signs or scientific notation.`); }
    if (price <= 0n || price > 1000000n * 1000000n) throw new Error(`${label}: price must be greater than zero and at most 1,000,000 USD.`);
    return { date, priceMicros: price.toString() };
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { symbol, source, basis: d.basis as PriceBasis, priceColumn: d.priceColumn as ImportDraft['priceColumn'], kind: d.kind as ImportDraft['kind'], currency: 'USD', observations };
}

/** Canonical identity includes metadata, precision-preserving values, and sorted dates. */
export async function datasetId(d: DatasetInput) {
  const canonical = JSON.stringify(['marketlab-csv-v1', d.symbol, d.source, d.currency, d.basis, d.priceColumn, d.kind, d.observations.map(p => [p.date, p.priceMicros])]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export function priceDecimal(micros: string): string {
  const value = BigInt(micros), fraction = (value % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (value / 1000000n).toString() + (fraction ? '.' + fraction : '');
}

export function seriesStats(observations: Observation[]) {
  if (observations.length < 2) throw new Error('At least two observations are required.');
  let peak = BigInt(observations[0].priceMicros), drawdown = 0, longestGap = 0;
  for (let i = 0; i < observations.length; i++) {
    const price = BigInt(observations[i].priceMicros); if (price > peak) peak = price;
    drawdown = Math.min(drawdown, Number(price - peak) / Number(peak) * 100);
    if (i > 0) longestGap = Math.max(longestGap, Math.round((Date.parse(observations[i].date) - Date.parse(observations[i - 1].date)) / 86400000));
  }
  const first = BigInt(observations[0].priceMicros), last = BigInt(observations.at(-1)!.priceMicros);
  return { changePct: Number(last - first) / Number(first) * 100, drawdownPct: drawdown, longestGapDays: longestGap };
}

export function datasetCSV(d: SavedDataset) {
  // Text metadata is prefixed when it could be interpreted as a spreadsheet formula.
  const escape = (value: string) => '"' + (/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const rows = [['symbol', 'date', d.priceColumn, 'currency', 'source', 'basis', 'kind', 'dataset_id', 'import_price_column', 'origin', 'provider_refreshed', 'provider_timezone'], ...d.observations.map(p => [d.symbol, p.date, priceDecimal(p.priceMicros), d.currency, d.source, d.basis, d.kind, d.id, d.priceColumn, d.origin ?? 'csv', d.providerRefreshed ?? '', d.providerTimezone ?? ''])];
  return rows.map(row => row.map(escape).join(',')).join('\r\n');
}

export const exampleDraft: ImportDraft = { symbol: 'XDEMO', source: 'MarketLab fictional CSV example', basis: 'raw', priceColumn: 'close', kind: 'synthetic', csv: 'date,close\n2026-09-14,100.125\n2026-09-15,101.250\n2026-09-16,98.375\n2026-09-17,103.125\n2026-09-18,102.875\n2026-09-21,104.250\n2026-09-22,105.125\n2026-09-23,103.875\n2026-09-24,106.250' };
