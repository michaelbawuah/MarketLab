import { parseDecimal, rounded } from './core.ts';
import { validateActions } from './corporate-actions.ts';
import type { PortfolioBinding } from './historical-portfolio.ts';

export const RESEARCH_METHOD = 'observed-close-sma-v1';
export const MAX_RESEARCH_RUNS = 30;
export type ResearchDraft = { name:string; assetId:string; benchmarkId:string; start:string; end:string; holdoutStart:string; window:number; initialCash:string; feeBps:number; slippageBps:number; confirmed:boolean };
export type ResearchSnapshot = { method:typeof RESEARCH_METHOD; config:ResearchDraft; asset:PortfolioBinding; benchmark:PortfolioBinding };
export type RunSummary = { id:string; name:string; created:string; symbol:string; benchmark:string; start:string; end:string };
export type SavedResearch = RunSummary & { snapshot:ResearchSnapshot; analysis:ResearchAnalysis; replayReceipt?:import('./replay-receipt.ts').ReplayReceipt };
type Fraction = { n:bigint; d:bigint };
function fraction(n:bigint,d=1n):Fraction { let a=n<0n?-n:n,b=d;while(b){const t=a%b;a=b;b=t;}return {n:n/(a||1n),d:d/(a||1n)}; }
function add(a:Fraction,b:Fraction){return fraction(a.n*b.d+b.n*a.d,a.d*b.d);}
function multiply(a:Fraction,n:bigint,d=1n){return fraction(a.n*n,a.d*d);}
function sharesText(s:Fraction){return s.d===1n?s.n.toString():`${s.n}/${s.d}`;}
function date(value:unknown):value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function validateResearchDraft(input:unknown):ResearchDraft {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Provide research settings.');
  const d=input as Record<string,unknown>,keys=['name','assetId','benchmarkId','start','end','holdoutStart','window','initialCash','feeBps','slippageBps','confirmed'];
  if(Object.keys(d).length!==keys.length||keys.some(k=>!(k in d)))throw new Error('Invalid research settings.');
  if(typeof d.name!=='string'||d.name.trim().length<2||d.name.trim().length>80||/[\u0000-\u001f\u007f]/.test(d.name))throw new Error('Enter a name of 2–80 characters.');
  if(![d.assetId,d.benchmarkId].every(id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id)))throw new Error('Choose saved asset and benchmark datasets.');
  if(!date(d.start)||!date(d.end)||!date(d.holdoutStart)||d.start>=d.holdoutStart||d.holdoutStart>=d.end)throw new Error('Choose start, later-period start and end dates in ascending order.');
  if(!Number.isSafeInteger(d.window)||(d.window as number)<2||(d.window as number)>500)throw new Error('SMA window must be 2–500 observations.');
  if(![d.feeBps,d.slippageBps].every(x=>Number.isSafeInteger(x)&&(x as number)>=0&&(x as number)<=1000))throw new Error('Fees and slippage must be whole basis points from 0–1,000.');
  if(typeof d.initialCash!=='string')throw new Error('Provide initial cash in USD.');
  const cash=parseDecimal(d.initialCash);if(cash<10000n||cash>10000000000n)throw new Error('Initial cash must be $100–$100,000,000.');
  if(d.confirmed!==true)throw new Error('Confirm the instruments, event coverage and research conventions.');
  return {...d,name:d.name.trim()} as ResearchDraft;
}

export type ResearchPoint = { date:string; value:string; cash:string; receivables:string; shares:string };
export type ResearchTrade = { date:string; signalDate:string|null; side:'buy'|'sell'; shares:string; fillMicros:string; gross:string; fee:string };
type Simulation = { history:ResearchPoint[]; trades:ResearchTrade[]; fees:string; returnPct:number; maxDrawdown:number };
export function observedMetrics(values:number[],benchmark:number[]) {
  if(values.length!==benchmark.length||values.length<2||[...values,...benchmark].some(v=>!Number.isFinite(v)||v<=0))throw new Error('Risk metrics need matching positive wealth observations.');
  const returns=values.slice(1).map((v,i)=>v/values[i]-1),reference=benchmark.slice(1).map((v,i)=>v/benchmark[i]-1),n=returns.length;
  if(n<2)return {intervals:n,volatilityPct:null,sharpe:null,beta:null,correlation:null};
  const mean=returns.reduce((a,b)=>a+b,0)/n,bmean=reference.reduce((a,b)=>a+b,0)/n;
  const ss=returns.reduce((a,r)=>a+(r-mean)**2,0),bs=reference.reduce((a,r)=>a+(r-bmean)**2,0),cov=returns.reduce((a,r,i)=>a+(r-mean)*(reference[i]-bmean),0),std=Math.sqrt(ss/(n-1));
  return {intervals:n,volatilityPct:std*100,sharpe:ss>1e-28?mean/std:null,beta:bs>1e-28?cov/bs:null,correlation:ss>1e-28&&bs>1e-28?Math.max(-1,Math.min(1,cov/Math.sqrt(ss*bs))):null};
}

// Each normalized close includes only splits effective by that close. Comparing
// it to its trailing average is equivalent to bringing the window onto that
// decision date's share basis, without future split information.
function signals(binding:PortfolioBinding,window:number) {
  const events=validateActions({source:binding.actions.source,complete:binding.actions.complete,events:binding.actions.events},binding.dataset).events;
  let factor=fraction(1n),sum=fraction(0n),cursor=0;const prices:Fraction[]=[];
  return binding.dataset.observations.map((p,i)=>{
    while(cursor<events.length&&events[cursor].date<=p.date){const e=events[cursor++];if(e.type==='split')factor=multiply(factor,BigInt(e.newShares),BigInt(e.oldShares));}
    const price=multiply(factor,BigInt(p.priceMicros));prices.push(price);sum=add(sum,price);
    if(i>=window)sum=add(sum,multiply(prices[i-window],-1n));
    return i>=window-1?price.n*BigInt(window)*sum.d>sum.n*price.d:null;
  });
}
function simulate(binding:PortfolioBinding,dates:string[],config:ResearchDraft,decisions:(boolean|null)[]|null):Simulation {
  const quotes=binding.dataset.observations,lookup=new Map(quotes.map((p,i)=>[p.date,i])),events=validateActions({source:binding.actions.source,complete:binding.actions.complete,events:binding.actions.events},binding.dataset).events;
  const initial=parseDecimal(config.initialCash);let cash=initial,receivables=0n,shares=fraction(0n),fees=0n,cursor=0,peak=Number(initial),maxDrawdown=0;
  const trades:ResearchTrade[]=[],history:ResearchPoint[]=[];
  // There is no pre-existing position at the start of each independent segment.
  while(cursor<events.length&&events[cursor].date<=dates[0])cursor++;
  for(const [dayIndex,day] of dates.entries()) {
    while(cursor<events.length&&events[cursor].date<=day){const e=events[cursor++];if(e.type==='split')shares=multiply(shares,BigInt(e.newShares),BigInt(e.oldShares));else receivables+=rounded(shares.n*parseDecimal(e.amount,6),shares.d*10000n);}
    const index=lookup.get(day);if(index===undefined)throw new Error(`Missing ${binding.dataset.symbol} close on ${day}.`);
    const raw=BigInt(quotes[index].priceMicros),long=decisions?decisions[index-1]:true;
    if(long===null||long===undefined)throw new Error('Insufficient observations before the start for the previous-close SMA signal.');
    if(long&&shares.n===0n&&cash>0n) {
      const fill=rounded(raw*BigInt(10000+config.slippageBps),10000n);
      const cost=(units:bigint)=>{const gross=rounded(units*fill,10000000000n),fee=rounded(gross*BigInt(config.feeBps),10000n);return {gross,fee,total:gross+fee};};
      let lo=0n,hi=cash*100000000000000n/(fill*BigInt(10000+config.feeBps));
      while(lo<hi){const mid=(lo+hi+1n)/2n;if(cost(mid).total<=cash)lo=mid;else hi=mid-1n;}
      const paid=cost(lo);
      if(lo>0n&&paid.gross>0n){shares=fraction(lo,1000000n);cash-=paid.total;fees+=paid.fee;trades.push({date:day,signalDate:decisions?quotes[index-1].date:null,side:'buy',shares:sharesText(shares),fillMicros:fill.toString(),gross:paid.gross.toString(),fee:paid.fee.toString()});}
    }else if(!long&&shares.n>0n){
      const fill=rounded(raw*BigInt(10000-config.slippageBps),10000n),gross=rounded(shares.n*fill,shares.d*10000n),fee=rounded(gross*BigInt(config.feeBps),10000n);
      trades.push({date:day,signalDate:quotes[index-1].date,side:'sell',shares:sharesText(shares),fillMicros:fill.toString(),gross:gross.toString(),fee:fee.toString()});cash+=gross-fee;fees+=fee;shares=fraction(0n);
    }
    const value=cash+receivables+rounded(shares.n*raw,shares.d*10000n);
    if(value<=0n||value>1000000000000000n)throw new Error('Wealth is outside the supported positive range. Check prices and split ratios.');
    peak=Math.max(peak,Number(value));maxDrawdown=Math.min(maxDrawdown,(Number(value)/peak-1)*100);
    history.push({date:day,value:value.toString(),cash:cash.toString(),receivables:receivables.toString(),shares:sharesText(shares)});
    // Buy-and-hold never rebalances; no later purchases from unspent rounding cash.
    if(!decisions&&dayIndex===0&&shares.n===0n)throw new Error('Initial cash cannot purchase one millionth of a benchmark share.');
  }
  return {history,trades,fees:fees.toString(),returnPct:(Number(history.at(-1)!.value)/Number(initial)-1)*100,maxDrawdown};
}
function segment(snapshot:ResearchSnapshot,dates:string[],decisions:(boolean|null)[]) {
  const strategy=simulate(snapshot.asset,dates,snapshot.config,decisions),buyHold=simulate(snapshot.asset,dates,snapshot.config,null),benchmark=simulate(snapshot.benchmark,dates,snapshot.config,null);
  const ref=benchmark.history.map(p=>Number(p.value));
  return {start:dates[0],end:dates.at(-1)!,observations:dates.length,longestGapDays:Math.max(...dates.slice(1).map((d,i)=>(Date.parse(d)-Date.parse(dates[i]))/86400000)),strategy,buyHold,benchmark,
    strategyRisk:observedMetrics(strategy.history.map(p=>Number(p.value)),ref),buyHoldRisk:observedMetrics(buyHold.history.map(p=>Number(p.value)),ref),benchmarkRisk:observedMetrics(ref,ref),outperformancePct:strategy.returnPct-benchmark.returnPct};
}
export function analyzeResearch(snapshot:ResearchSnapshot) {
  if(snapshot.method!==RESEARCH_METHOD)throw new Error('Unsupported research method.');
  const config=validateResearchDraft(snapshot.config);
  if(config.assetId!==snapshot.asset.dataset.id||config.benchmarkId!==snapshot.benchmark.dataset.id)throw new Error('Research inputs do not match selected datasets.');
  const asset=snapshot.asset.dataset,benchmark=snapshot.benchmark.dataset;
  if(asset.currency!=='USD'||benchmark.currency!=='USD')throw new Error('Research requires USD datasets.');
  const dates=asset.observations.filter(p=>p.date>=config.start&&p.date<=config.end).map(p=>p.date),bdates=benchmark.observations.filter(p=>p.date>=config.start&&p.date<=config.end).map(p=>p.date);
  if(dates[0]!==config.start||dates.at(-1)!==config.end||!dates.includes(config.holdoutStart))throw new Error('Every evaluation boundary must be a supplied asset observation date.');
  if(JSON.stringify(dates)!==JSON.stringify(bdates))throw new Error('Asset and benchmark need identical observation dates throughout the evaluation range. Missing dates are never filled or silently dropped.');
  const development=dates.filter(d=>d<config.holdoutStart),holdout=dates.filter(d=>d>=config.holdoutStart);
  if(development.length<3||holdout.length<3)throw new Error('Use at least three observations in both the earlier and later evaluation periods.');
  const decision=signals(snapshot.asset,config.window);
  const full=segment(snapshot,dates,decision),early=segment(snapshot,development,decision),late=segment(snapshot,holdout,decision);
  return {full,development:early,holdout:late,synthetic:asset.kind==='synthetic'||benchmark.kind==='synthetic'};
}
export type ResearchAnalysis = ReturnType<typeof analyzeResearch>;
export type ResearchSegment = ResearchAnalysis['full'];
export async function researchFingerprint(snapshot:ResearchSnapshot) {const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
export const RESEARCH_ASSUMPTIONS = {
  signal:'Close strictly above trailing SMA is long, otherwise cash. Window counts supplied observations. Split normalization uses only events effective by decision close.',
  execution:'Previous observation signal executes at the next supplied close. Costs charged at execution; no final liquidation, no order after end date.',
  sizing:'Long/cash, no borrowing or shorts. New buys in millionth shares, exact split fractions retained. USD cash, gross and fees rounded half up to cents; fills rounded to price millionths.',
  dividends:'Splits and ex-date entitlement before trades. Dividends accumulate as nonspendable receivables; payment dates unavailable. No reinvestment, taxes, cash interest or cash in lieu.',
  comparisons:'Same cash, dates, fee/slippage rates and dividend conventions for SMA, same-asset buy-and-hold and selected benchmark. Benchmark is a modeled investment, not an official index total-return series.',
  evaluation:'Earlier and later periods each restart with initial cash; earlier observations may warm up later signals. Configuration is fixed per run; repeated trials can overfit the later period.',
  risk:'Sample volatility, Sharpe (0% cash), covariance beta and Pearson correlation use consecutive matched observed wealth intervals. Costs at the first evaluation close are excluded from risk intervals; later costs are included. Total return and drawdown include all costs. No annualization or calendar completeness claim.',
  scope:'User-declared instrument/event coverage. No survivorship-bias correction, liquidity, market impact or intraday fills. Hypothetical research, not forecasts.'
};
export function researchCSV(run:SavedResearch) {
  const lines=['segment,date,strategy_value_usd,buy_hold_value_usd,benchmark_value_usd,strategy_cash_usd,strategy_receivables_usd'];
  const dollars=(s:string)=>(BigInt(s)/100n).toString()+'.'+(BigInt(s)%100n).toString().padStart(2,'0');
  for(const key of ['full','development','holdout'] as const){const part=run.analysis[key];part.strategy.history.forEach((p,i)=>lines.push([key,p.date,dollars(p.value),dollars(part.buyHold.history[i].value),dollars(part.benchmark.history[i].value),dollars(p.cash),dollars(p.receivables)].join(',')));}
  return lines.join('\n')+'\n';
}
