'use client';
import { FileCheck2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { brokerageCashMatches, type BrokerageReceipt } from '@/lib/finance/brokerage-csv';
import type { LedgerEntry } from '@/lib/finance/historical-portfolio';
import './brokerage-import.css';

const money = (value: string) => { const n=BigInt(value),a=n<0n?-n:n;return `${n<0n?'−':''}$${(a/100n).toLocaleString('en-US')}.${(a%100n).toString().padStart(2,'0')}`; };
export default function BrokerageReceiptView({receipt,transactions,saved=false}:{receipt:BrokerageReceipt;transactions:LedgerEntry[];saved?:boolean}) {
  const records=new Map(receipt.records.map(r=>[r.id,r]));
  return <section className="brokerage-receipt" aria-label="Brokerage conversion review">
    <header><h3><FileCheck2 size={20}/> Schwab CSV conversion</h3><span>{receipt.kind==='synthetic'?'FICTIONAL FILE':'USER-SUPPLIED FILE'}</span></header>
    <p>{receipt.transactionCount} transactions · {receipt.firstDate} → {receipt.lastDate} · {saved?'Saved with this portfolio':'Converted for review; not saved yet'}</p>
    <div className="brokerage-totals"><div><span>Net cash movement</span><strong>{money(receipt.cashChange)}</strong></div><div><span>Explicit trading fees</span><strong>{money(receipt.fees)}</strong></div><div><span>Conversion check</span><strong>{brokerageCashMatches(receipt,transactions)?'Cash preserved':'Needs review'}</strong></div></div>
    <p className="brokerage-boundary">{receipt.preambleRemoved?'Account title removed. ':''}No account number or transaction description is saved. {receipt.footerTotal!==null?'The export total matches the converted cash movements.':'This file has no summary total to compare.'}</p>
    {receipt.priceDifferences>0&&<p className="brokerage-notice" role="status">Review {receipt.priceDifferences} trade{receipt.priceDifferences===1?'':'s'}: the cash amount differs from displayed price × quantity. Amount and Fees &amp; Comm determine the ledger values; the displayed price may be rounded.</p>}
    <details><summary>Review converted transactions and ordering</summary>
      <p>Dates run oldest to newest. Same-day rows follow your <strong>{receipt.order}</strong> setting. The export has no intraday times; this is a daily-close research model.</p>
      <Table><TableHeader><TableRow><TableHead>Source record / date</TableHead><TableHead>Entry</TableHead><TableHead className="numeric">Gross</TableHead><TableHead className="numeric">Fee</TableHead><TableHead className="numeric">Cash movement</TableHead></TableRow></TableHeader><TableBody>{transactions.slice(0,20).map(t=><TableRow key={t.id}><TableCell>#{records.get(t.id)?.record}<small className="cell-small">{t.date}</small></TableCell><TableCell>{t.type} {t.symbol}<small className="cell-small">{records.get(t.id)?.action}</small></TableCell><TableCell className="numeric">{money(t.amount)}</TableCell><TableCell className="numeric">{money(t.fee)}</TableCell><TableCell className="numeric">{money(records.get(t.id)?.netCash??'0')}</TableCell></TableRow>)}</TableBody></Table>
      <p>Showing the first {Math.min(20,transactions.length)} of {transactions.length} entries. The saved full-report JSON includes every converted entry and its source record number. Matching file contents do not authenticate the broker or establish that the history is complete.</p>
    </details>
  </section>;
}
