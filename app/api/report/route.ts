import { demoPortfolioCertificate, confidenceRows } from '@/lib/finance/confidence';
import { identity,loadWorkspace,failure } from '@/lib/server';
import { DATASET,LAST_DATE } from '@/lib/finance/demo';
export async function GET(){
 try{
  const d=await loadWorkspace(await identity()),a=d.analytics;
  const rows:unknown[][]=[['MarketLab research report'],...confidenceRows(demoPortfolioCertificate(d)),[],['Dataset',DATASET],['Data warning','SYNTHETIC PRICES - NOT ACTUAL MARKET DATA'],['Valuation date',LAST_DATE],['Currency','USD'],[],['Metric','Value'],['Portfolio value',a.value.toFixed(2)],['Cash',a.cash.toFixed(2)],['Net contributions',a.contributions.toFixed(2)],['Total gain',a.gain.toFixed(2)],['Time-weighted return (%)',a.returnPct.toFixed(6)],['Fees',a.fees.toFixed(2)],['Dividends',a.dividends.toFixed(2)],[],['Symbol','Shares','Price','Market value','Cost basis','Unrealized gain','Price date'],...a.holdings.map(h=>[h.symbol,h.units,h.price.toFixed(2),h.value.toFixed(2),h.cost.toFixed(2),h.gain.toFixed(2),h.priceDate]),[],['Date','Type','Symbol','Shares','Amount','Fee','Source'],...d.transactions.map(t=>[t.date,t.kind,t.symbol,Number(t.units)/1e6,(Number(t.amount)/100).toFixed(2),(Number(t.fee)/100).toFixed(2),t.id.startsWith('seed-')?'Sample':'Manual']),[],['Method','Close-based time-weighted return; same-day events in ledger order; external flows excluded; average acquisition cost; no corporate actions.']];
  const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
  return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="marketlab-research-report.csv"','Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
