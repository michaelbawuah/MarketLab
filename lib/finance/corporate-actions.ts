import { actionsCertificate } from './confidence.ts';
import { parseDecimal } from './core.ts';
import { priceDecimal, type DatasetInput } from './market-data.ts';

export type ActionDraft = { date: string; type: 'split' | 'dividend'; newShares: string; oldShares: string; amount: string };
export type ActionInput = { source: string; complete: boolean; events: ActionDraft[] };
export type ActionSet = { source: string; complete: true; events: ActionDraft[] };
export type SavedActions = ActionSet & { revision: number; updated: string };
export const MAX_ACTIONS = 100;

export function validateActions(input: unknown, dataset: DatasetInput): ActionSet {
  if (dataset.basis !== 'raw' || dataset.priceColumn !== 'close') throw new Error('Use unadjusted close prices. Applying events to adjusted or unknown prices could count them twice.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a corporate-action record.');
  const d = input as Record<string, unknown>;
  if (Object.keys(d).some(k => !['source', 'complete', 'events'].includes(k)) || typeof d.source !== 'string' || d.complete !== true || !Array.isArray(d.events)) throw new Error('Provide a source and confirm that the event list covers this date range, including dates with no events.');
  const source = d.source.trim();
  if (source.length < 3 || source.length > 160 || /[\u0000-\u001f\u007f]/.test(source)) throw new Error('Enter an event source of 3–160 characters.');
  if (d.events.length > MAX_ACTIONS) throw new Error(`Use at most ${MAX_ACTIONS} events.`);
  const first = dataset.observations[0].date, last = dataset.observations.at(-1)!.date, seen = new Set<string>();
  const events: ActionDraft[] = d.events.map((value, index): ActionDraft => {
    const label = `Event ${index + 1}`;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: invalid event.`);
    const e = value as Record<string, unknown>;
    if (Object.keys(e).length !== 5 || ['date', 'type', 'newShares', 'oldShares', 'amount'].some(k => typeof e[k] !== 'string')) throw new Error(`${label}: invalid fields.`);
    const date = e.date as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date || date <= first || date > last) throw new Error(`${label}: date must be after ${first} and on or before ${last}. Start-date events are already reflected in the initial close.`);
    if (e.type !== 'split' && e.type !== 'dividend') throw new Error(`${label}: choose Split or Cash dividend.`);
    const key = `${date}:${e.type}`;
    if (seen.has(key)) throw new Error(`${label}: duplicate ${e.type} on ${date}. Combine same-date dividends into one per-share amount.`);
    seen.add(key);
    if (e.type === 'split') {
      if (e.amount !== '' || !/^[1-9]\d{0,5}$/.test(e.newShares as string) || !/^[1-9]\d{0,5}$/.test(e.oldShares as string) || e.newShares === e.oldShares) throw new Error(`${label}: use distinct positive whole-number split terms up to 999,999 (for example 2 new for 1 old).`);
      return { date, type: 'split', newShares: e.newShares as string, oldShares: e.oldShares as string, amount: '' };
    }
    let amount: bigint;
    try { amount = parseDecimal(e.amount as string, 6); } catch { throw new Error(`${label}: dividend must be a decimal with at most six places.`); }
    if (amount <= 0n || amount > 1000000n * 1000000n || e.newShares !== '' || e.oldShares !== '') throw new Error(`${label}: dividend must be positive and at most 1,000,000 USD per post-split share.`);
    return { date, type: 'dividend', newShares: '', oldShares: '', amount: priceDecimal(amount.toString()) };
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'split' ? -1 : 1));
  return { source, complete: true, events };
}

// Exact rational shares and USD millionths avoid rounding fractional reverse splits.
// Convert only bounded dimensionless chart ratios to Number.
type Fraction = { n: bigint; d: bigint };
function gcd(a: bigint, b: bigint): bigint { while (b) { const next = a % b; a = b; b = next; } return a; }
function fraction(n: bigint, d = 1n): Fraction { const g = gcd(n, d); return { n: n / g, d: d / g }; }
function multiply(a: Fraction, n: bigint, d = 1n) { return fraction(a.n * n, a.d * d); }
function add(a: Fraction, b: Fraction) { return fraction(a.n * b.d + b.n * a.d, a.d * b.d); }
function ratio(a: Fraction, divisor = 1n) {
  const denominator = a.d * divisor;
  // Fixed precision quotient avoids Infinity/Infinity after many split ratios.
  return Number(a.n / denominator) + Number((a.n % denominator) * 1000000000000n / denominator) / 1e12;
}
export function actionPerformance(dataset: DatasetInput, input: ActionInput) {
  const actions = validateActions(input, dataset), initial = BigInt(dataset.observations[0].priceMicros);
  let shares = fraction(1n), income = fraction(0n), cursor = 0, high = 1, drawdownPct = 0;
  const history = dataset.observations.map(p => {
    while (cursor < actions.events.length && actions.events[cursor].date <= p.date) {
      const e = actions.events[cursor++];
      if (e.type === 'split') shares = multiply(shares, BigInt(e.newShares), BigInt(e.oldShares));
      else income = add(income, multiply(shares, parseDecimal(e.amount, 6)));
    }
    const stock = multiply(shares, BigInt(p.priceMicros)), wealth = add(stock, income);
    const splitIndex = ratio(stock, initial) * 100, wealthIndex = ratio(wealth, initial) * 100;
    if (![splitIndex, wealthIndex].every(v => Number.isFinite(v) && v >= 1e-6 && v <= 1e12)) throw new Error('These events create an extreme share balance. Check the split ratios.');
    high = Math.max(high, wealthIndex / 100); drawdownPct = Math.min(drawdownPct, (wealthIndex / 100 / high - 1) * 100);
    return { date: p.date, rawIndex: Number(p.priceMicros) / Number(initial) * 100, splitIndex, wealthIndex };
  });
  const last = history.at(-1)!;
  return { history, priceReturnPct: last.rawIndex - 100, splitReturnPct: last.splitIndex - 100, cashInclusiveReturnPct: last.wealthIndex - 100, drawdownPct, shares: `${shares.n}/${shares.d}`, incomePerInitialShare: ratio(income, 1000000n), eventCount: actions.events.length };
}

export function actionsExport(datasetId: string, dataset: DatasetInput, actions: SavedActions) {
  const analysis = actionPerformance(dataset, { source: actions.source, complete: actions.complete, events: actions.events });
  return { format: 'marketlab-actions-v1', confidence: actionsCertificate(dataset,actions,analysis,datasetId), datasetId, symbol: dataset.symbol, currency: dataset.currency, source: dataset.source, basis: dataset.basis, observations: dataset.observations, actions, assumptions: { initialShares: '1', initialMark: 'first supplied close', dividendTiming: 'ex-date receivable; per post-split share', reinvestment: false, fractionalShares: 'retained exactly; no cash in lieu', feesAndTaxes: false, eventVerification: 'user-supplied, not independently verified' }, analysis };
}
