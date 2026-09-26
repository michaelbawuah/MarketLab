import { parseDecimal, rounded } from './core.ts';
import { validateActions } from './corporate-actions.ts';
import type { PortfolioAnalysis, PortfolioSnapshot } from './historical-portfolio.ts';

export const BENCHMARK_METHOD = 'cash-flow-close-v1';
export const BENCHMARK_ASSUMPTIONS = {
  flows: 'Only deposits and withdrawals; same dates, amounts and CSV order as the portfolio. Internal trades and dividend payments are excluded.',
  execution: 'Each deposit buys exact fractional shares at that close; withdrawals sell shares. No fees, slippage, borrowing or shorting.',
  dividends: 'Non-reinvested ex-date receivables; never spendable. Splits precede dividends and close-timed flows.',
  prices: 'Exact benchmark closes on the portfolio valuation grid; no stale or future substitution. Between-date actions accrue before the next valuation.',
  rounding: 'Aggregate holdings and each dividend entitlement round half up to cents. Full withdrawal of marked holdings liquidates all shares.',
  comparison: 'Hypothetical zero-cost selected instrument versus the recorded portfolio after its costs; not an official index, alpha or a prediction.',
} as const;

type Fraction = { n: bigint; d: bigint };
function fraction(n: bigint, d = 1n): Fraction {
  let a = n < 0n ? -n : n, b = d;
  while (b) { const r = a % b; a = b; b = r; }
  const result = { n: n / (a || 1n), d: d / (a || 1n) };
  if (result.n.toString().length > 12000 || result.d.toString().length > 12000) throw new Error('Benchmark share precision exceeds the supported range. Use a shorter ledger.');
  return result;
}
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const multiply = (a: Fraction, n: bigint, d = 1n) => fraction(a.n * n, a.d * d);
const text = (a: Fraction) => a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
const mark = (a: Fraction, price: bigint) => rounded(a.n * price, a.d * 10000n);

/** Ideal fractional holding, funded exclusively by the portfolio's external flows. */
export function comparePortfolio(s: PortfolioSnapshot, portfolio: PortfolioAnalysis) {
  if (!s.benchmark) return null;
  if (s.benchmark.method !== BENCHMARK_METHOD) throw new Error('Unsupported portfolio benchmark version.');
  const { dataset, actions } = s.benchmark.binding;
  const events = validateActions({ source: actions.source, complete: actions.complete, events: actions.events }, dataset).events;
  const start = portfolio.history[0].date;
  if (dataset.currency !== 'USD' || dataset.firstDate > start || dataset.lastDate < s.asOf) throw new Error(`Benchmark ${dataset.symbol}: USD price and event coverage must include ${start} through ${s.asOf}.`);
  const quotes = new Map(dataset.observations.map(p => [p.date, BigInt(p.priceMicros)]));
  const byDate = new Map<string, typeof s.transactions>();
  for (const t of s.transactions) if (t.type === 'deposit' || t.type === 'withdrawal') {
    const list = byDate.get(t.date) ?? []; list.push(t); byDate.set(t.date, list);
  }
  let shares = fraction(0n), receivables = 0n, contributions = 0n, previous = 0n, growth = 1, high = 1, maxDrawdown = 0, cursor = 0;
  let outputBytes = 0;
  const bounded = <T,>(item: T): T => {
    outputBytes += new TextEncoder().encode(JSON.stringify(item)).length;
    if (outputBytes > 1024 * 1024) throw new Error('Benchmark audit exceeds 1 MiB. Use fewer flows or a shorter comparison period.');
    return item;
  };
  const flows: { id: string; date: string; type: string; amount: string; shares: string }[] = [];
  const dividends: { exDate: string; eligibleShares: string; earned: string }[] = [];
  const history = portfolio.history.map(p => {
    const price = quotes.get(p.date);
    if (!price || price <= 0n) throw new Error(`Benchmark ${dataset.symbol}: missing exact close on ${p.date}. Choose aligned prices or remove the benchmark; no stale or future mark is substituted.`);
    while (cursor < events.length && events[cursor].date <= p.date) {
      const e = events[cursor++];
      if (!shares.n) continue;
      if (e.type === 'split') shares = multiply(shares, BigInt(e.newShares), BigInt(e.oldShares));
      else {
        const earned = mark(shares, parseDecimal(e.amount, 6));
        receivables += earned;
        dividends.push(bounded({ exDate: e.date, eligibleShares: text(shares), earned: earned.toString() }));
      }
    }
    const before = mark(shares, price) + receivables;
    if (before === 0n && shares.n > 0n) throw new Error('Benchmark holdings fell below one cent of valuation precision. Use larger funding amounts or remove the comparison; a recoverable fractional holding cannot be reported as a total loss.');
    if (before > 1000000000000000n) throw new Error('Benchmark valuation exceeds the supported range.');
    if (previous > 0n) growth *= Number(before) / Number(previous);
    for (const t of byDate.get(p.date) ?? []) {
      const amount = BigInt(t.amount);
      if (t.type === 'deposit') {
        shares = add(shares, fraction(amount * 10000n, price)); contributions += amount;
      } else {
        const liquid = mark(shares, price);
        if (amount > liquid) throw new Error(`Benchmark ${dataset.symbol}: withdrawal ${t.id} on ${p.date} exceeds its spendable holdings. Unpaid dividends cannot fund withdrawals. Choose another benchmark or remove the comparison.`);
        shares = amount === liquid ? fraction(0n) : add(shares, fraction(-amount * 10000n, price));
        contributions -= amount;
      }
      flows.push(bounded({ id: t.id, date: p.date, type: t.type, amount: t.amount, shares: text(shares) }));
    }
    const value = mark(shares, price) + receivables;
    if (value === 0n && shares.n > 0n) throw new Error('Benchmark holdings fell below one cent of valuation precision. Use larger funding amounts or remove the comparison.');
    if (value < 0n || value > 1000000000000000n || !Number.isFinite(growth)) throw new Error('Benchmark valuation exceeds the supported range.');
    if (contributions.toString() !== p.contributions) throw new Error('Benchmark external-flow reconciliation failed.');
    high = Math.max(high, growth); maxDrawdown = Math.min(maxDrawdown, growth / high - 1); previous = value;
    return bounded({ date: p.date, value: value.toString(), receivables: receivables.toString(), contributions: contributions.toString(), shares: text(shares), returnPct: (growth - 1) * 100, portfolioValue: p.value, difference: (BigInt(p.value) - value).toString() });
  });
  return {
    method: BENCHMARK_METHOD, symbol: dataset.symbol, datasetId: dataset.id,
    value: previous.toString(), gain: (previous - contributions).toString(), contributions: contributions.toString(), receivables: receivables.toString(), shares: text(shares),
    returnPct: (growth - 1) * 100, maxDrawdown: maxDrawdown * 100,
    valueDifference: (BigInt(portfolio.value) - previous).toString(), returnDifferencePp: portfolio.returnPct - (growth - 1) * 100,
    synthetic: portfolio.synthetic || dataset.kind === 'synthetic', history, flows, dividends,
  };
}
export type PortfolioComparison = NonNullable<ReturnType<typeof comparePortfolio>>;

export function portfolioHistoryCSV(portfolio: PortfolioAnalysis, comparison: PortfolioComparison | null) {
  const columns = ['date', 'portfolio_value_cents', 'net_contributions_cents', 'portfolio_cash_cents', 'portfolio_receivables_cents', 'portfolio_twr_pct', 'benchmark_value_cents', 'benchmark_receivables_cents', 'benchmark_twr_pct', 'portfolio_minus_benchmark_cents', 'benchmark_symbol', 'benchmark_dataset_id', 'benchmark_method', 'contains_synthetic_inputs'];
  return [columns.join(','), ...portfolio.history.map((p, i) => {
    const b = comparison?.history[i];
    return [p.date, p.value, p.contributions, p.cash, p.receivables, p.returnPct, b?.value ?? '', b?.receivables ?? '', b?.returnPct ?? '', b?.difference ?? '', comparison?.symbol ?? '', comparison?.datasetId ?? '', comparison?.method ?? '', comparison?.synthetic ?? portfolio.synthetic].join(',');
  })].join('\r\n');
}
