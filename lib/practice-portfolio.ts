import type { ImportDraft } from './finance/market-data.ts';
import { SCHWAB_FORMAT } from './finance/brokerage-csv.ts';
import type { PortfolioDraft } from './finance/historical-portfolio.ts';

// Known fictional inputs: event completeness is part of this authored example,
// never inferred for a customer's imported prices or brokerage history.
const closes=[94,95,94,96,97,98,97,99,100,99,101,102,100,101,99,100,102,101,99,100,100,102,103,110,108];
const dates=Array.from({length:33},(_,i)=>new Date(Date.UTC(2026,7,17+i))).filter(d=>![0,6].includes(d.getUTCDay())).map(d=>d.toISOString().slice(0,10));
export const practicePrices:ImportDraft={symbol:'XDEMO',source:'MarketLab fictional practice portfolio v1',basis:'raw',priceColumn:'close',kind:'synthetic',csv:'date,close\n'+dates.map((date,i)=>`${date},${closes[i]}`).join('\n')+'\n'};
export const practiceActions={source:'MarketLab fictional practice v1: no splits or dividends',complete:true as const,events:[]};
export function practiceDraft(csv:string,datasetId:string):PortfolioDraft {
  return {name:'My practice portfolio',asOf:'2026-09-18',csv,bindings:[{symbol:'XDEMO',datasetId}],confirmed:true,benchmarkDatasetId:'',importFormat:SCHWAB_FORMAT,brokerageOrder:'newest-first',brokerageKind:'synthetic'};
}
