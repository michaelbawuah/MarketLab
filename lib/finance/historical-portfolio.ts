import { parseDecimal, rounded } from './core.ts';
import { csvRows, type SavedDataset } from './market-data.ts';
import { validateActions, type SavedActions } from './corporate-actions.ts';

export const PORTFOLIO_METHOD = 'historical-close-v1';
export const MAX_LEDGER_ROWS = 500;
export const LEDGER_HEADER = 'id,date,type,symbol,shares,amount,fee,reference';
export type LedgerKind = 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'dividend_payment';
export type LedgerEntry = { id: string; date: string; type: LedgerKind; symbol: string; units: string; amount: string; fee: string; reference: string };
export type PortfolioDraft = { name: string; asOf: string; csv: string; bindings: { symbol: string; datasetId: string }[]; confirmed: boolean; benchmarkDatasetId?: string };
export type PortfolioBinding = { dataset: SavedDataset; actions: SavedActions };
export type PortfolioSnapshot = { method: typeof PORTFOLIO_METHOD; name: string; asOf: string; transactions: LedgerEntry[]; bindings: PortfolioBinding[]; benchmark?: { method: 'cash-flow-close-v1'; binding: PortfolioBinding } };
export type SavedPortfolio = { revision: number; fingerprint: string; updated: string; snapshot: PortfolioSnapshot };
function validDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '1900-01-01' && Number.isFinite(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date; }
export function parseLedger(csv: string, asOf: string): LedgerEntry[] {
  const rows = csvRows(csv), expected = LEDGER_HEADER.split(',');
  if (!rows.length || rows[0].map(h => h.toLowerCase()).join(',') !== LEDGER_HEADER) throw new Error(`Use this exact CSV header: ${LEDGER_HEADER}`);
  if (rows.length < 2 || rows.length > MAX_LEDGER_ROWS + 1) throw new Error(`Include 1–${MAX_LEDGER_ROWS} transactions, starting with cash funding.`);
  const seen = new Set<string>();
  return rows.slice(1).map((row, i): LedgerEntry => {
    const label = `Row ${i + 1}`;
    if (row.length !== expected.length) throw new Error(`${label}: expected eight columns.`);
    const [id, date, type, rawSymbol, shares, amount, fee, reference] = row, symbol = rawSymbol.toUpperCase();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || seen.has(id)) throw new Error(`${label}: use a unique transaction ID (letters, digits, _ or -).`);
    seen.add(id);
    if (!validDate(date) || date > asOf) throw new Error(`${label}: date must be valid and on or before the valuation date.`);
    if (!['deposit', 'withdrawal', 'buy', 'sell', 'dividend_payment'].includes(type)) throw new Error(`${label}: unsupported transaction type.`);
    let units: bigint, cents: bigint, fees: bigint;
    try { units = parseDecimal(shares || '0', 6); cents = parseDecimal(amount, 2); fees = parseDecimal(fee || '0', 2); } catch { throw new Error(`${label}: use positive USD amounts with at most two decimals and shares with at most six decimals.`); }
    if (cents <= 0n || units > 1000000n * 1000000n || fees > cents) throw new Error(`${label}: amount must be positive, shares at most 1,000,000, and fee no greater than gross amount.`);
    if (type === 'buy' || type === 'sell') {
      if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol) || units === 0n || reference) throw new Error(`${label}: trades require a symbol and positive shares, with an empty reference.`);
    } else if (type === 'dividend_payment') {
      if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol) || units || fees || !validDate(reference) || reference > date) throw new Error(`${label}: dividend payments require a symbol, ex-date reference, zero shares and zero fee.`);
    } else if (symbol || units || fees || reference) throw new Error(`${label}: cash flows require empty symbol/reference and zero shares/fee.`);
    return { id, date, type: type as LedgerKind, symbol, units: units.toString(), amount: cents.toString(), fee: fees.toString(), reference };
  }).sort((a, b) => a.date.localeCompare(b.date)); // Stable: CSV order governs same-date ledger events.
}
export function validatePortfolioDraft(value: unknown, today = new Date().toISOString().slice(0, 10)) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a portfolio import.');
  const d = value as PortfolioDraft;
  if (Object.keys(d).some(k => !['name','asOf','csv','bindings','confirmed','benchmarkDatasetId'].includes(k)) || ['name','asOf','csv'].some(k => typeof (d as unknown as Record<string, unknown>)[k] !== 'string') || !Array.isArray(d.bindings) || d.confirmed !== true) throw new Error('Complete the import and confirm that the ledger and instrument mappings are correct.');
  if (d.benchmarkDatasetId !== undefined && (typeof d.benchmarkDatasetId !== 'string' || (d.benchmarkDatasetId !== '' && !/^[a-f0-9]{64}$/.test(d.benchmarkDatasetId)))) throw new Error('Choose a saved benchmark dataset or leave the comparison off.');
  const name = d.name.trim();
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Use a portfolio name of 2–80 characters.');
  if (!validDate(d.asOf) || d.asOf > today) throw new Error('Choose a valid valuation date, no later than today.');
  const transactions = parseLedger(d.csv, d.asOf), symbols = [...new Set(transactions.filter(t => t.symbol).map(t => t.symbol))].sort();
  if (symbols.length > 10 || d.bindings.length !== symbols.length) throw new Error('Select exactly one dataset for each traded symbol (maximum ten symbols).');
  const bindings = d.bindings.map(b => {
    if (!b || typeof b !== 'object' || Object.keys(b).length !== 2 || typeof b.symbol !== 'string' || typeof b.datasetId !== 'string' || !symbols.includes(b.symbol) || !/^[a-f0-9]{64}$/.test(b.datasetId)) throw new Error('Select a saved dataset for every symbol.');
    return { symbol: b.symbol, datasetId: b.datasetId };
  }).sort((a,b) => a.symbol.localeCompare(b.symbol));
  if (new Set(bindings.map(b => b.symbol)).size !== symbols.length) throw new Error('Each symbol needs exactly one dataset.');
  return { name, asOf: d.asOf, transactions, bindings, benchmarkDatasetId: d.benchmarkDatasetId || undefined };
}

type Fraction = { n: bigint; d: bigint };
function gcd(a: bigint, b: bigint): bigint { if (a < 0n) a = -a; while (b) { const next = a % b; a = b; b = next; } return a; }
function f(n: bigint, d = 1n): Fraction { const g = gcd(n,d); return { n: n/g, d: d/g }; }
const mul = (a: Fraction, n: bigint, d = 1n) => f(a.n*n, a.d*d);
const add = (a: Fraction, b: Fraction) => f(a.n*b.d+b.n*a.d, a.d*b.d);
const greater = (a: Fraction, b: Fraction) => a.n*b.d > b.n*a.d;
const exact = (a: Fraction) => a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
const moneyValue = (shares: Fraction, priceMicros: string) => rounded(shares.n*BigInt(priceMicros),shares.d*10000n);
export function analyzePortfolio(s: PortfolioSnapshot) {
  if (s.method !== PORTFOLIO_METHOD) throw new Error('Unsupported portfolio calculation version.');
  const start = s.transactions[0]?.date;
  if (!start) throw new Error('Import a ledger that starts with cash funding.');
  const bound = new Map(s.bindings.map(b => [b.dataset.symbol,b]));
  for (const b of s.bindings) {
    validateActions({ source: b.actions.source, complete: b.actions.complete, events: b.actions.events },b.dataset);
    if (b.dataset.lastDate < s.asOf) throw new Error(`${b.dataset.symbol}: price and action coverage ends ${b.dataset.lastDate}, before ${s.asOf}. Choose a covered date or a newer snapshot.`);
  }
  for (const t of s.transactions) if (t.symbol && !bound.has(t.symbol)) throw new Error(`Select a dataset for ${t.symbol}.`);
  const days = new Set([start,s.asOf,...s.transactions.map(t=>t.date)]);
  const quotes = new Map<string,string>(), events = new Map<string,{symbol:string;event:SavedActions['events'][number]}[]>();
  for (const b of s.bindings) {
    for (const p of b.dataset.observations) if(p.date>=start&&p.date<=s.asOf) { days.add(p.date); quotes.set(`${b.dataset.symbol}:${p.date}`,p.priceMicros); }
    for (const event of b.actions.events) if(event.date>=start&&event.date<=s.asOf) { days.add(event.date); const list=events.get(event.date)??[];list.push({symbol:b.dataset.symbol,event});events.set(event.date,list); }
  }
  const positions = new Map<string,{shares:Fraction;cost:bigint}>(), receivables = new Map<string,{symbol:string;exDate:string;earned:bigint;paidDate:string|null}>();
  let cash=0n, contributions=0n, realized=0n, income=0n, fees=0n, previous=0n, growth=1, high=1, maxDrawdown=0;
  const history:{date:string;value:string;cash:string;receivables:string;contributions:string;returnPct:number}[]=[], journal:{date:string;kind:string;symbol:string;detail:string}[]=[];
  const quote = (symbol:string,date:string) => { const p=quotes.get(`${symbol}:${date}`); if(!p)throw new Error(`Missing ${symbol} close on ${date}. Add that observation or choose a period with aligned prices; stale or future marks are never substituted.`);return p; };
  const outstanding = () => [...receivables.values()].filter(r=>!r.paidDate).reduce((n,r)=>n+r.earned,0n);
  const mark = (date:string) => {
    let value=cash+outstanding();for(const [symbol,p] of positions)if(p.shares.n)value+=moneyValue(p.shares,quote(symbol,date));
    if(value>1000000000000000n)throw new Error('Portfolio value exceeds the supported valuation limit.');return value;
  };
  const txByDate=new Map<string,LedgerEntry[]>();for(const t of s.transactions){const list=txByDate.get(t.date)??[];list.push(t);txByDate.set(t.date,list);}
  for (const date of [...days].sort()) {
    // Actions happen before the close and before that day's close-timed trades.
    for(const {symbol,event} of (events.get(date)??[]).sort((a,b)=>a.event.type===b.event.type?0:a.event.type==='split'?-1:1)) {
      const p=positions.get(symbol);if(!p?.shares.n)continue;
      if(event.type==='split') { p.shares=mul(p.shares,BigInt(event.newShares),BigInt(event.oldShares));journal.push({date,kind:'split',symbol,detail:`${event.newShares} new for ${event.oldShares} old; shares now ${exact(p.shares)}; cost basis unchanged`}); }
      else { const earned=moneyValue(p.shares,parseDecimal(event.amount,6).toString()), key=`${symbol}:${date}`;receivables.set(key,{symbol,exDate:date,earned,paidDate:null});income+=earned;journal.push({date,kind:'dividend earned',symbol,detail:`${earned} cents receivable on ${exact(p.shares)} eligible shares`}); }
    }
    let value=mark(date);if(previous>0n)growth*=Number(value)/Number(previous);
    for(const tx of txByDate.get(date)??[]) {
      const amount=BigInt(tx.amount),fee=BigInt(tx.fee),units=f(BigInt(tx.units),1000000n), p=positions.get(tx.symbol)??{shares:f(0n),cost:0n};
      if(tx.type==='deposit') {cash+=amount;contributions+=amount;}
      else if(tx.type==='withdrawal') {cash-=amount;contributions-=amount;}
      else if(tx.type==='buy') {quote(tx.symbol,date);cash-=amount+fee;p.shares=add(p.shares,units);p.cost+=amount+fee;positions.set(tx.symbol,p);}
      else if(tx.type==='sell') {
        quote(tx.symbol,date);if(greater(units,p.shares))throw new Error(`${tx.id}: not enough ${tx.symbol} shares on ${date}.`);
        const cost=rounded(p.cost*units.n*p.shares.d,units.d*p.shares.n);cash+=amount-fee;realized+=amount-fee-cost;p.cost-=cost;p.shares=add(p.shares,mul(units,-1n));positions.set(tx.symbol,p);
      } else {
        const r=receivables.get(`${tx.symbol}:${tx.reference}`);
        if(!r || r.paidDate || r.earned!==amount)throw new Error(`${tx.id}: dividend payment must match the unpaid ${tx.symbol} entitlement for ex-date ${tx.reference}, including cent rounding.`);
        r.paidDate=date;cash+=amount;
      }
      fees+=fee;if(cash<0n)throw new Error(`${tx.id}: insufficient spendable cash on ${date}. Unpaid dividends cannot fund a trade or withdrawal.`);
      const after=mark(date);if(tx.type!=='deposit'&&tx.type!=='withdrawal'&&value>0n)growth*=Number(after)/Number(value);value=after;
    }
    if(!Number.isFinite(growth))throw new Error('Return calculation exceeds the supported range.');
    high=Math.max(high,growth);maxDrawdown=Math.min(maxDrawdown,growth/high-1);
    history.push({date,value:value.toString(),cash:cash.toString(),receivables:outstanding().toString(),contributions:contributions.toString(),returnPct:(growth-1)*100});previous=value;
  }
  let unrealized=0n;
  const holdings=[...positions].filter(([,p])=>p.shares.n).map(([symbol,p])=>{const price=quote(symbol,s.asOf),value=moneyValue(p.shares,price);unrealized+=value-p.cost;return {symbol,shares:exact(p.shares),priceMicros:price,value:value.toString(),cost:p.cost.toString(),gain:(value-p.cost).toString()};});
  const value=BigInt(history.at(-1)!.value),gain=value-contributions;
  if(gain!==realized+unrealized+income)throw new Error('Portfolio reconciliation failed. Check the ledger and price inputs.');
  return {value:value.toString(),cash:cash.toString(),receivables:outstanding().toString(),contributions:contributions.toString(),gain:gain.toString(),realized:realized.toString(),unrealized:unrealized.toString(),income:income.toString(),fees:fees.toString(),returnPct:(growth-1)*100,maxDrawdown:maxDrawdown*100,holdings,history,journal,dividends:[...receivables.values()].map(r=>({...r,earned:r.earned.toString()})),synthetic:s.bindings.some(b=>b.dataset.kind==='synthetic')};
}
export type PortfolioAnalysis = ReturnType<typeof analyzePortfolio>;
export async function portfolioFingerprint(snapshot: PortfolioSnapshot) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export function ledgerCSV(transactions: LedgerEntry[]) {
  const decimal=(n:string,scale:number)=>{const x=BigInt(n),p=10n**BigInt(scale);return `${x/p}.${(x%p).toString().padStart(scale,'0')}`;};
  return [LEDGER_HEADER,...transactions.map(t=>[t.id,t.date,t.type,t.symbol,decimal(t.units,6),decimal(t.amount,2),decimal(t.fee,2),t.reference].join(','))].join('\n');
}
