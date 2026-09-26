import { parseDecimal,rounded } from './core.ts';
import type { ActionDraft } from './corporate-actions.ts';
import type { ResearchSegment } from './research.ts';

export type EquityEvent={id:string;kind:'start'|'buy'|'sell'|'split'|'dividend';date:string;observedDate:string;pointIndex:number;title:string;detail:string};
export type EquityEventGroup={id:string;pointIndex:number;firstDate:string;lastDate:string;events:EquityEvent[]};
const dollars=(cents:bigint)=>`$${cents/100n}.${(cents%100n).toString().padStart(2,'0')}`;
const micros=(value:string)=>{const n=BigInt(value);return `$${n/1000000n}.${(n%1000000n).toString().padStart(6,'0')}`;};
function shareCount(n:bigint,d:bigint){let a=n,b=d;while(b){const r=a%b;a=b;b=r;}n/=a||1n;d/=a||1n;if(1000000n%d===0n){const units=n*1000000n/d,fraction=(units%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return `${units/1000000n}${fraction?'.'+fraction:''}`;}return `${n}/${d}`;}

/** Explain recorded events without altering the curve. Between-close events
 * retain their effective date and attach to the next supplied valuation. */
export function equityEvents(part:ResearchSegment,actions:ActionDraft[],initialCash:string):EquityEvent[] {
  if(!part.strategy.history.length)return [];
  const result:EquityEvent[]=[{id:`start:${part.start}`,kind:'start',date:part.start,observedDate:part.start,pointIndex:0,title:'Evaluation starts with fresh cash',detail:`${dollars(parseDecimal(initialCash))} starting cash before any first-close trade costs. No shares or dividend receivables carry into this evaluation period.`}];
  // The simulation skips events on the first date: no carried-in holdings.
  const events=actions.filter(a=>a.date>part.start&&a.date<=part.end).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.type===b.type?0:a.type==='split'?-1:1));
  const trades=new Map(part.strategy.trades.map(t=>[t.date,t]));
  let cursor=0;
  part.strategy.history.forEach((point,index)=>{
    const [carriedN,carriedD=1n]=(part.strategy.history[index-1]?.shares??'0').split('/').map(BigInt);
    let n=carriedN,d=carriedD;
    while(cursor<events.length&&events[cursor].date<=point.date) {
      const event=events[cursor++],held=shareCount(n,d);
      if(event.type==='split') {
        n*=BigInt(event.newShares);d*=BigInt(event.oldShares);
        result.push({id:`split:${event.date}`,kind:'split',date:event.date,observedDate:point.date,pointIndex:index,title:`${event.newShares}-for-${event.oldShares} split`,detail:`Carried-in strategy shares change from ${held} to ${shareCount(n,d)}. A split creates no cash by itself; wealth is marked at the next supplied close.`});
      } else {
        const cents=rounded(n*parseDecimal(event.amount,6),d*10000n);
        result.push({id:`dividend:${event.date}`,kind:'dividend',date:event.date,observedDate:point.date,pointIndex:index,title:`${dollars(cents)} dividend entitlement`,detail:`${held} eligible shares × $${event.amount} per share, rounded once to cents. This increases unpaid receivables, not spendable cash. Same-day purchases are not entitled.`});
      }
    }
    const trade=trades.get(point.date);
    if(trade){const [tn,td=1n]=trade.shares.split('/').map(BigInt);result.push({id:`${trade.side}:${point.date}`,kind:trade.side,date:point.date,observedDate:point.date,pointIndex:index,title:trade.side==='buy'?'Strategy buys shares':'Strategy sells shares',detail:`Signal from ${trade.signalDate??'the starting rule'} executes at this close: ${shareCount(tn,td)} shares at ${micros(trade.fillMicros)}; ${dollars(BigInt(trade.gross))} gross and ${dollars(BigInt(trade.fee))} fee. The fill includes the configured slippage.`});}
  });
  return result;
}

/** Greedy grouping keeps every event while limiting marker density. */
export function groupEquityEvents(events:EquityEvent[],start:string,end:string,maxMarkers=16):EquityEventGroup[] {
  if(!Number.isSafeInteger(maxMarkers)||maxMarkers<2)throw new Error('At least two marker slots are required.');
  const range=Math.max(1,Date.parse(end)-Date.parse(start)),gap=range/(maxMarkers-1),groups:EquityEventGroup[]=[];
  for(const event of events) {
    const last=groups.at(-1),first=last?.events[0];
    if(last&&first&&Date.parse(event.observedDate)-Date.parse(first.observedDate)<gap) {last.events.push(event);last.lastDate=event.date;}
    else groups.push({id:event.id,pointIndex:event.pointIndex,firstDate:event.date,lastDate:event.date,events:[event]});
  }
  return groups;
}
