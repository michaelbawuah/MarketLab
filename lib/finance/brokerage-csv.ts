import { parseDecimal, rounded } from './core.ts';
import { csvRows } from './market-data.ts';
import type { LedgerEntry } from './historical-portfolio.ts';

export const SCHWAB_FORMAT = 'schwab-transactions-v1';
export const SCHWAB_HEADER = 'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount';
export type BrokerageOrder = 'newest-first' | 'oldest-first';
export type BrokerageKind = 'historical' | 'synthetic';
export type BrokerageRecord = {
  id: string; record: number; action: string; date: string; netCash: string;
  reportedPriceMicros: string | null; displayedGross: string | null;
};
export type BrokerageReceipt = {
  format: typeof SCHWAB_FORMAT; kind: BrokerageKind; order: BrokerageOrder;
  firstDate: string; lastDate: string; transactionCount: number;
  cashChange: string; fees: string; footerTotal: string | null;
  priceDifferences: number; preambleRemoved: boolean; records: BrokerageRecord[];
};
export type BrokerageImport = { transactions: LedgerEntry[]; receipt: BrokerageReceipt };

const CASH_ACTIONS = new Set(['MoneyLink Deposit', 'MoneyLink Transfer', 'Bank Transfer', 'Wire Funds Received', 'Wire Received', 'Funds Received', 'Wire Sent', 'Funds Paid']);
const INCOMING = new Set(['MoneyLink Deposit', 'Wire Funds Received', 'Wire Received', 'Funds Received']);
const OUTGOING = new Set(['Wire Sent', 'Funds Paid']);
const compact = (row: string[]) => { const r = [...row]; while (r.length > 8 && r.at(-1) === '') r.pop(); return r; };
const isHeader = (row: string[]) => compact(row).join(',').toLowerCase() === SCHWAB_HEADER.toLowerCase();
const isTitle = (row: string[]) => row.length === 1 && /^Transactions\s+for account\s+.+\s+as of\s+.+$/i.test(row[0]);
const isTotal = (row: string[]) => /^Transactions Total:?$/i.test(row[0] ?? '');

export function detectPortfolioFormat(csv: string): 'marketlab-ledger-v1' | typeof SCHWAB_FORMAT {
  const rows = csvRows(csv);
  if (rows[0]?.[0]?.toLowerCase() === 'id') return 'marketlab-ledger-v1';
  if (rows.some((r, i) => i < 2 && isHeader(r))) return SCHWAB_FORMAT;
  throw new Error('Use a Schwab transaction-history export or a MarketLab ledger CSV. Holdings and tax reports have a different format.');
}

function isoDate(value: string, asOf: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!m) throw new Error('Expected an MM/DD/YYYY date. Backdated “as of” entries are not supported.');
  const date = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (date < '1900-01-01' || !Number.isFinite(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date.');
  if (date > asOf) throw new Error(`Transaction date ${date} is after the valuation date ${asOf}.`);
  return date;
}

/** Locale-specific USD syntax; never repair malformed grouping or round precision away. */
function decimal(value: string, scale: number, currency: boolean, blank = false): bigint {
  if (!value && blank) return 0n;
  let text = value, sign = 1n;
  if (text.startsWith('(') && text.endsWith(')')) { sign = -1n; text = text.slice(1, -1); }
  else if (text.startsWith('-')) { sign = -1n; text = text.slice(1); }
  if (currency && text.startsWith('$')) text = text.slice(1);
  if (!new RegExp(`^(?:\\d{1,9}|\\d{1,3}(?:,\\d{3}){1,2})(?:\\.\\d{1,${scale}})?$`).test(text)) throw new Error(`Invalid ${currency ? 'USD value' : 'share quantity'} or unsupported precision.`);
  return sign * parseDecimal(text.replaceAll(',', ''), scale);
}

function unsupported(action: string) {
  if (/dividend|reinvest|interest|cap gain/i.test(action)) return `${action} needs an income or dividend-entitlement model. This importer does not yet support that action; no rows have been imported.`;
  if (/split|transfer|journal|merger|spin|lieu/i.test(action)) return `${action} may change holdings or their cost basis. It cannot be treated as a cash deposit; no rows have been imported.`;
  return `Unsupported action “${action || '(empty)'}”. This importer accepts Buy, Sell and the listed bank/wire cash transfers only; no rows have been imported.`;
}

/** One account, complete cash-funded long-only USD history. No raw descriptions/account IDs survive conversion. */
export function importSchwabCSV(csv: string, asOf: string, order: BrokerageOrder, kind: BrokerageKind): BrokerageImport {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(asOf + 'T00:00:00Z')) || new Date(asOf + 'T00:00:00Z').toISOString().slice(0, 10) !== asOf) throw new Error('Choose a valid valuation date first.');
  if (!['newest-first', 'oldest-first'].includes(order)) throw new Error('Choose the same-day transaction order.');
  if (!['historical', 'synthetic'].includes(kind)) throw new Error('Identify this export as historical or fictional.');
  const rows = csvRows(csv), preambleRemoved = !!rows[0] && isTitle(rows[0]), headerIndex = preambleRemoved ? 1 : 0;
  if (!rows[headerIndex] || !isHeader(rows[headerIndex])) throw new Error(`Expected Schwab transaction-history columns: ${SCHWAB_HEADER}`);
  const data = rows.slice(headerIndex + 1);
  let footerTotal: bigint | null = null;
  if (data.length && isTotal(data.at(-1)!)) {
    const footer = compact(data.pop()!);
    if (footer.length !== 8 || footer.slice(1, 7).some(Boolean)) throw new Error('Unexpected Transactions Total row. Re-export one account without editing the file.');
    try { footerTotal = decimal(footer[7], 2, true); } catch { throw new Error('The Transactions Total amount is invalid.'); }
  }
  if (!data.length || data.length > 500) throw new Error('Include 1–500 transactions from one account, starting with cash funding.');
  let cashChange = 0n, fees = 0n, priceDifferences = 0;
  const records: BrokerageRecord[] = [];
  const transactions = data.map((original, i): LedgerEntry => {
    const record = i + 1, row = compact(original), id = `schwab-${record}`;
    try {
      if (isTitle(row) || isHeader(row) || isTotal(row)) throw new Error('Multiple account sections or an embedded total are not supported. Export one account.');
      if (row.length !== 8) throw new Error('Expected eight columns, with an optional empty trailing column.');
      const [rawDate, action, symbol, description, rawQuantity, rawPrice, rawFee, rawAmount] = row;
      const date = isoDate(rawDate, asOf), net = decimal(rawAmount, 2, true), fee = decimal(rawFee, 2, true, true);
      if (net === 0n) throw new Error('Zero cash amounts are not supported.');
      if (fee < 0n) throw new Error('Fee rebates need separate treatment and are not supported.');
      let type: LedgerEntry['type'], amount: bigint, units = 0n, price: bigint | null = null, displayedGross: bigint | null = null;
      if (action === 'Buy' || action === 'Sell') {
        if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol) || /\b(?:CALL|PUT|OPTION|CONTRACT|BOND)\b/i.test(description)) throw new Error('Only USD stock/ETF trades with plain ticker symbols are supported. Options and bonds are not stock trades.');
        units = decimal(rawQuantity, 6, false); price = decimal(rawPrice, 6, true);
        if (units <= 0n || units > 1000000n * 1000000n || price <= 0n || price > 1000000n * 1000000n) throw new Error('Shares and prices must be positive and no greater than 1,000,000.');
        type = action === 'Buy' ? 'buy' : 'sell';
        if ((type === 'buy' && net >= 0n) || (type === 'sell' && net <= 0n)) throw new Error('Cash sign does not match the trade: a buy must debit cash and a sale must credit cash.');
        // Amount is net cash, Fees & Comm is explicit. Displayed price may be rounded.
        amount = type === 'buy' ? -net - fee : net + fee;
        displayedGross = rounded(units * price, 10000000000n);
        if (displayedGross !== amount) priceDifferences++;
      } else {
        if (!CASH_ACTIONS.has(action)) throw new Error(unsupported(action));
        if (symbol || decimal(rawQuantity, 6, false, true) !== 0n || decimal(rawPrice, 6, true, true) !== 0n || fee !== 0n) throw new Error('Cash transfers must have no security, shares, price or fee.');
        if ((INCOMING.has(action) && net < 0n) || (OUTGOING.has(action) && net > 0n)) throw new Error('Cash sign conflicts with the transfer direction.');
        type = net > 0n ? 'deposit' : 'withdrawal'; amount = net > 0n ? net : -net;
      }
      if (amount <= 0n || amount > 99999999999n || fee > amount) throw new Error('Gross amount must be positive, below 1 billion USD, and at least the fee.');
      cashChange += net; fees += fee;
      records.push({ id, record, action, date, netCash: net.toString(), reportedPriceMicros: price?.toString() ?? null, displayedGross: displayedGross?.toString() ?? null });
      return { id, date, type, symbol, units: units.toString(), amount: amount.toString(), fee: fee.toString(), reference: '' };
    } catch (e) { throw new Error(`Schwab data record ${record}: ${(e as Error).message}`); }
  });
  if (footerTotal !== null && footerTotal !== cashChange) throw new Error('Transactions Total does not match the sum of the imported cash movements. No rows have been imported.');
  // No intraday timestamps exist. The declared file order governs equal-date records.
  transactions.sort((a, b) => a.date.localeCompare(b.date) || (order === 'newest-first' ? Number(b.id.slice(7)) - Number(a.id.slice(7)) : Number(a.id.slice(7)) - Number(b.id.slice(7))));
  return { transactions, receipt: { format: SCHWAB_FORMAT, kind, order, firstDate: transactions[0].date, lastDate: transactions.at(-1)!.date, transactionCount: transactions.length, cashChange: cashChange.toString(), fees: fees.toString(), footerTotal: footerTotal?.toString() ?? null, priceDifferences, preambleRemoved, records } };
}

export function brokerageCashMatches(receipt: BrokerageReceipt, transactions: LedgerEntry[]) {
  const byId = new Map(transactions.map(t => [t.id, t]));
  return byId.size === transactions.length && receipt.transactionCount === transactions.length && receipt.records.length === transactions.length && new Set(receipt.records.map(r => r.id)).size === transactions.length && receipt.records.every(r => {
    const t = byId.get(r.id);
    if (!t || t.date !== r.date) return false;
    const amount = BigInt(t.amount), fee = BigInt(t.fee);
    return BigInt(r.netCash) === (t.type === 'buy' ? -amount - fee : t.type === 'sell' ? amount - fee : t.type === 'deposit' ? amount : t.type === 'withdrawal' ? -amount : 0n);
  }) && receipt.records.reduce((n, r) => n + BigInt(r.netCash), 0n).toString() === receipt.cashChange && transactions.reduce((n, t) => n + BigInt(t.fee), 0n).toString() === receipt.fees && (receipt.footerTotal === null || receipt.footerTotal === receipt.cashChange);
}
