import { account, parseDecimal, rounded, SCALE } from './core.ts';
import type { DatasetInput, SavedDataset } from './market-data.ts';
import type { SavedActions, actionPerformance } from './corporate-actions.ts';
import type { PortfolioSnapshot, PortfolioAnalysis } from './historical-portfolio.ts';
import type { PortfolioComparison } from './portfolio-benchmark.ts';
import type { ResearchAnalysis, ResearchSnapshot } from './research.ts';
import type { Workspace } from './demo.ts';

export type EvidenceCheck = { id: string; label: string; status: 'passed' | 'failed' | 'not_run'; detail: string };
export type ConfidenceSource = { role: string; symbol: string; source: string; kind: string; basis: string; origin: string; firstDate: string; lastDate: string; observations: number; events: string; id?: string };
export type ConfidenceCertificate = {
  version: 'marketlab-confidence-v1'; subject: string; reference: string; method: string;
  classification: 'Fictional inputs' | 'Contains fictional inputs' | 'Declared historical inputs' | 'Recorded cash flows';
  takeaway: string; coverage: { start: string; end: string; observations: number; longestGapDays: number };
  sources: ConfidenceSource[]; checks: EvidenceCheck[]; assumptions: string[]; limitations: string[];
};
export type EvaluationPeriod = 'full' | 'development' | 'holdout';
const periods = { full: 'Full period', development: 'Earlier period', holdout: 'Later period · fresh cash' };
const independent = (): EvidenceCheck => ({ id: 'independent-replay', label: 'Independent Python replay', status: 'not_run', detail: 'No independent replay receipt is attached to this report. Project test results do not certify an individual report.' });
const boundary = 'These checks establish internal consistency only. They do not authenticate prices or events, establish trading skill, or predict future returns.';
const calendar = 'Exchange-session completeness is not assessed. A gap may be a weekend, holiday or missing observation; no prices are filled in.';
const money = (v: string | bigint) => { const n=BigInt(v), a=n<0n?-n:n; return `${n<0n?'−':''}$${(a/100n).toLocaleString('en-US')}.${(a%100n).toString().padStart(2,'0')}`; };
const pct = (n: number) => `${n>0?'+':''}${n.toFixed(2)}%`;
const same = (a: unknown, b: unknown) => JSON.stringify(a)===JSON.stringify(b);
function check(id: string, label: string, predicate: () => boolean, detail: string): EvidenceCheck {
  let pass=false;try {pass=predicate();} catch { /* A malformed value cannot earn a passing check. */ }
  return {id,label,status:pass?'passed':'failed',detail:pass?detail:'The supplied result did not satisfy this check. Review the inputs and regenerate the report.'};
}
function coverage(dates: string[]) { return {start:dates[0]??'',end:dates.at(-1)??'',observations:dates.length,longestGapDays:Math.max(0,...dates.slice(1).map((d,i)=>(Date.parse(d)-Date.parse(dates[i]))/86400000))}; }
function source(d: DatasetInput & Partial<SavedDataset>, role: string, events: string): ConfidenceSource {
  return {role,symbol:d.symbol,source:d.source,kind:d.kind,basis:d.basis,origin:d.origin==='alphavantage'?`Provider connector · refreshed ${d.providerRefreshed??'not recorded'} (${d.providerTimezone??'timezone not recorded'})`:'Declared by the importer or fixture',firstDate:d.observations[0]?.date??'',lastDate:d.observations.at(-1)?.date??'',observations:d.observations.length,events,...(d.id?{id:d.id}:{})};
}
function classify(sources: ConfidenceSource[]): ConfidenceCertificate['classification'] {
  if(!sources.length)return 'Recorded cash flows';
  const count=sources.filter(s=>s.kind==='synthetic').length;
  return count===sources.length?'Fictional inputs':count?'Contains fictional inputs':'Declared historical inputs';
}
function finish(c: Omit<ConfidenceCertificate,'version'|'classification'>): ConfidenceCertificate {
  const failed=c.checks.some(v=>v.status==='failed');
  return {version:'marketlab-confidence-v1',classification:classify(c.sources),...c,takeaway:failed?'A consistency check failed. Review this report before interpreting its performance.':c.takeaway};
}
export function confidenceStatus(c: ConfidenceCertificate) {
  return c.checks.some(v=>v.status==='failed')?'Needs review':c.checks.some(v=>v.status==='passed')?'Listed checks passed':'Not checked';
}
export function researchCertificate(run: { id: string; snapshot: ResearchSnapshot; analysis: ResearchAnalysis }, period: EvaluationPeriod='full'): ConfidenceCertificate {
  const s=run.snapshot,p=run.analysis[period],cfg=s.config;
  const dates=s.asset.dataset.observations.filter(v=>v.date>=cfg.start&&v.date<=cfg.end&&(period==='full'||(period==='development'?v.date<cfg.holdoutStart:v.date>=cfg.holdoutStart))).map(v=>v.date);
  const paths=[{data:s.asset.dataset,model:p.strategy},{data:s.asset.dataset,model:p.buyHold},{data:s.benchmark.dataset,model:p.benchmark}];
  const ending=BigInt(p.strategy.history.at(-1)!.value),delta=ending-BigInt(p.benchmark.history.at(-1)!.value);
  return finish({subject:`Strategy experiment · ${periods[period]}`,reference:run.id,method:s.method,coverage:coverage(dates),
    takeaway:`The strategy ended at ${money(ending)} from ${money(parseDecimal(cfg.initialCash))}, a ${pct(p.strategy.returnPct)} return after modeled costs. It finished ${money(delta<0n?-delta:delta)} ${delta===0n?'apart from':delta>0n?'above':'below'} the selected benchmark over these ${dates.length} observations.`,
    sources:([['Strategy asset',s.asset],['Benchmark',s.benchmark]] as const).map(([role,b])=>source(b.dataset,role,`${b.actions.source} · revision ${b.actions.revision} · ${b.actions.events.length} declared events; completeness is user-declared`)),
    checks:[
      check('dates','Matched observation dates',()=>dates.length>=3&&p.observations===dates.length&&p.start===dates[0]&&p.end===dates.at(-1)&&paths.every(({data,model})=>{const supplied=new Set(data.observations.map(v=>v.date));return same(model.history.map(v=>v.date),dates)&&dates.every(d=>supplied.has(d));}),'All three paths use the same supplied evaluation dates; boundaries and counts match.'),
      check('wealth','Exact wealth reconciliation',()=>paths.every(({data,model})=>{const prices=new Map(data.observations.map(v=>[v.date,BigInt(v.priceMicros)]));return model.history.every(v=>{const [n,d=1n]=v.shares.split('/').map(BigInt);return d>0n&&n>=0n&&BigInt(v.cash)>=0n&&BigInt(v.receivables)>=0n&&BigInt(v.value)===BigInt(v.cash)+BigInt(v.receivables)+rounded(n*prices.get(v.date)!,d*10000n);});}),'Every observed value equals cash + receivables + shares marked at the supplied close, with exact cent rounding.'),
      check('fees','Trade fee totals',()=>paths.every(({model})=>model.trades.every(t=>BigInt(t.fee)>=0n)&&model.trades.reduce((n,t)=>n+BigInt(t.fee),0n)===BigInt(model.fees)),'Each path’s reported fees equal the sum of its execution fees.'),
      check('timing','Prior-close signal timing',()=>{const index=new Map(s.asset.dataset.observations.map((v,i)=>[v.date,i]));return p.strategy.trades.every(t=>dates.includes(t.date)&&t.signalDate===s.asset.dataset.observations[(index.get(t.date)??0)-1]?.date);},'Each recorded strategy signal precedes its execution at the next supplied close. This checks timing, not whether every signal is correct.'),
      check('returns','Ending-return arithmetic',()=>paths.every(({model})=>Number.isFinite(model.returnPct)&&Math.abs(model.returnPct-(Number(model.history.at(-1)!.value)/Number(parseDecimal(cfg.initialCash))-1)*100)<=1e-10),'Returns match ending wealth and starting cash within 1e-10 percentage points.'),independent()],
    assumptions:[`${cfg.window}-observation moving average; long or cash; previous-close signals execute at the next supplied close.`,`${(cfg.feeBps/100).toFixed(2)}% fee and ${(cfg.slippageBps/100).toFixed(2)}% adverse slippage per trade.`, 'No borrowing, shorting, cash interest, taxes, forced final sale or dividend reinvestment. Dividends remain nonspendable receivables.', 'Earlier and later periods each restart with initial cash. Repeated trials can overfit the later period.'],
    limitations:[boundary,calendar,'Source labels and fingerprints are references, not signatures or independent authentication. These checks do not replay the trading strategy.','Risk describes supplied observation intervals without annualization, liquidity, market-impact or survivorship corrections.']});
}

export function costDemoCertificate(run: Parameters<typeof researchCertificate>[0]): ConfidenceCertificate {
  const c=researchCertificate(run),s=run.analysis.full.strategy,cfg=run.snapshot.config;
  return {...c,subject:'Fictional cost experiment · selected setting',takeaway:confidenceStatus(c)==='Needs review'?c.takeaway:`With ${(cfg.feeBps/100).toFixed(2)}% fees and ${(cfg.slippageBps/100).toFixed(2)}% slippage per trade, this fictional ${money(parseDecimal(cfg.initialCash))} account ended at ${money(s.history.at(-1)!.value)} (${pct(s.returnPct)}). Its ${s.trades.length} trades incurred ${money(s.fees)} in fees; the result also includes adverse execution prices.`};
}

export function portfolioCertificate(snapshot: PortfolioSnapshot, a: PortfolioAnalysis, b: PortfolioComparison|null, reference: string): ConfidenceCertificate {
  const sources=snapshot.bindings.map(v=>source(v.dataset,'Portfolio holding',`${v.actions.source} · revision ${v.actions.revision}; ${v.actions.events.length} events; completeness is user-declared`));
  if(snapshot.benchmark)sources.push(source(snapshot.benchmark.binding.dataset,'Cash-flow benchmark',`${snapshot.benchmark.binding.actions.source}; completeness is user-declared`));
  return finish({subject:'Historical portfolio',reference,method:snapshot.method,coverage:coverage(a.history.map(p=>p.date)),sources,
    takeaway:`The portfolio is worth ${money(a.value)} after ${money(a.contributions)} in net contributions. Its investment ${BigInt(a.gain)<0n?'loss':'gain'} is ${money(BigInt(a.gain)<0n?-BigInt(a.gain):a.gain)}, with a ${pct(a.returnPct)} time-weighted return.${b?` It ends ${money(BigInt(b.valueDifference)<0n?-BigInt(b.valueDifference):b.valueDifference)} ${BigInt(b.valueDifference)<0n?'below':'above'} the zero-cost cash-flow benchmark.`:''}`,
    checks:[
      check('gain','Exact gain reconciliation',()=>BigInt(a.value)-BigInt(a.contributions)===BigInt(a.gain)&&BigInt(a.gain)===BigInt(a.realized)+BigInt(a.unrealized)+BigInt(a.income),'Wealth − net contributions equals realized gain + unrealized gain + earned dividends.'),
      check('wealth','Ending wealth components',()=>BigInt(a.value)===BigInt(a.cash)+BigInt(a.receivables)+a.holdings.reduce((n,h)=>n+BigInt(h.value),0n)&&a.history.at(-1)?.value===a.value&&a.history.at(-1)?.date===snapshot.asOf,'Holdings + cash + receivables match reported ending wealth and the as-of observation.'),
      check('flows','Recorded contributions and fees',()=>snapshot.transactions.reduce((n,t)=>n+(t.type==='deposit'?BigInt(t.amount):t.type==='withdrawal'?-BigInt(t.amount):0n),0n)===BigInt(a.contributions)&&snapshot.transactions.reduce((n,t)=>n+BigInt(t.fee),0n)===BigInt(a.fees),'Contribution and fee totals reconcile to the supplied ledger.'),
      ...(b?[check('benchmark','Benchmark dates and external flows',()=>same(a.history.map(p=>p.date),b.history.map(p=>p.date))&&a.history.every((p,i)=>p.contributions===b.history[i].contributions)&&same(snapshot.transactions.filter(t=>t.type==='deposit'||t.type==='withdrawal').map(t=>[t.id,t.date,t.type,t.amount]),b.flows.map(t=>[t.id,t.date,t.type,t.amount]))&&BigInt(a.value)-BigInt(b.value)===BigInt(b.valueDifference),'Dates, deposit/withdrawal records, contribution totals and ending-value difference match.')]:[]),independent()],
    assumptions:['USD ledger events execute at the close in supplied order. Exact-date prices are required when marking holdings.', 'Split fractions are retained exactly; ex-date dividend receivables become cash only through a matching payment entry.', 'Cost basis is weighted average including buy fees; this is research accounting, not tax-lot reporting.',...(b?['The benchmark uses the same external flows with ideal fractional shares and zero fees or slippage.']:[])],
    limitations:[boundary,calendar,'Instrument mappings and corporate-action completeness are user-declared. A cash-flow comparison is not an official total-return index.','The independent Research lab verifier does not support portfolio reports. No independent portfolio replay receipt is attached.']});
}

export function actionsCertificate(dataset: DatasetInput & Partial<SavedDataset>, actions: SavedActions, a: ReturnType<typeof actionPerformance>, reference: string): ConfidenceCertificate {
  return finish({subject:'Split and dividend analysis',reference,method:'one-share-event-study-v1',coverage:coverage(dataset.observations.map(p=>p.date)),sources:[source(dataset,'Holding',`${actions.source} · revision ${actions.revision} · ${actions.events.length} events; completeness is user-declared`)],
    takeaway:`Across ${a.history.length} supplied closes, raw price changed ${pct(a.priceReturnPct)}. A holding that retains split fractions and earned cash dividends changed ${pct(a.cashInclusiveReturnPct)}, before fees and taxes.`,
    checks:[check('dates','Observed date coverage',()=>same(a.history.map(p=>p.date),dataset.observations.map(p=>p.date))&&a.eventCount===actions.events.length,'Every analysis observation matches a supplied close and the event count matches the recorded list.'),check('endpoints','Return-to-index consistency',()=>{const last=a.history.at(-1)!;return [a.priceReturnPct,a.splitReturnPct,a.cashInclusiveReturnPct].every((v,i)=>Number.isFinite(v)&&Math.abs(v-([last.rawIndex,last.splitIndex,last.wealthIndex][i]-100))<=1e-10);},'Reported changes match the ending rebased indices. This is not an independent event replay.'),independent()],
    assumptions:['Start with one share at the first supplied close; each index starts at 100.', 'Apply splits before dividends on the same day; retain exact fractional shares.', 'Dividends accrue on ex-date without reinvestment. Fees, taxes and payment dates are not modeled.'],limitations:[boundary,calendar,'Corporate actions are supplied by the user and are not fetched or independently verified.','The independent Research lab verifier does not support this event-study report.']});
}

export function demoPortfolioCertificate(w: Workspace): ConfidenceCertificate {
  const a=w.analytics,ledger=account(w.transactions),dates=[...new Set(w.quotes.map(p=>p.date))].sort();
  const sources=[...new Set(w.quotes.map(p=>p.symbol))].map(symbol=>{const rows=w.quotes.filter(p=>p.symbol===symbol).sort((x,y)=>x.date.localeCompare(y.date));return {role:'Demo holding',symbol,source:'MarketLab synthetic-daily-v1',kind:'synthetic',basis:'Fictional unadjusted closes',origin:'Built-in fixture',firstDate:rows[0].date,lastDate:rows.at(-1)!.date,observations:rows.length,events:'Corporate actions are not modeled'};});
  const cents=(n:number)=>BigInt(Math.round(n*100));
  return finish({subject:'Demo portfolio',reference:`synthetic-daily-v1 · ledger revision ${w.version}`,method:'close-ledger-v1',coverage:coverage(dates),sources,
    takeaway:`This fictional portfolio has a value of ${money(cents(a.value))}, including ${money(ledger.contributions)} in net contributions. Its ${pct(a.returnPct)} time-weighted return describes the sample prices and recorded demo trades.`,
    checks:[check('ledger','Ledger totals',()=>cents(a.cash)===ledger.cash&&cents(a.contributions)===ledger.contributions&&cents(a.fees)===ledger.fees,'Cash, net contributions and fees reconcile to an exact replay of the demo ledger.'),check('marks','Ending position valuation',()=>{let total=ledger.cash;for(const [symbol,p] of ledger.positions){if(!p.units)continue;const q=w.quotes.filter(v=>v.symbol===symbol).sort((x,y)=>x.date.localeCompare(y.date)).at(-1);if(!q)return false;total+=rounded(p.units*BigInt(q.close),SCALE);}return total===cents(a.value);},'Ending wealth matches cash plus positions at their latest supplied closes.'),independent()],assumptions:['USD, long-only paper account; currency rounds to cents and shares use millionths.', 'Latest supplied close on or before each valuation; same-day ledger order matters.', 'External flows are excluded from time-weighted return. Corporate actions and taxes are not modeled.'],limitations:[boundary,'All prices are fictional. Weekday dates do not establish exchange-calendar accuracy.','The independent Research lab verifier does not support this demo-ledger report.']});
}

const csvCell=(v: string)=>'"'+(/^[=+\-@\t\r]/.test(v)?"'"+v:v).replaceAll('"','""')+'"';
/** Append two columns; keep the original observation schema and rectangular CSV. */
export function withConfidenceCSV(csv: string, certificate: ConfidenceCertificate) {
  const lines=csv.trimEnd().split(/\r?\n/);
  return lines.map((line,i)=>i===0?line+',report_takeaway,confidence_certificate_json':line+','+(i===1?csvCell(certificate.takeaway)+','+csvCell(JSON.stringify(certificate)):',' )).join('\r\n')+'\r\n';
}
export function confidenceRows(c: ConfidenceCertificate): unknown[][] {
  return [['Report takeaway',c.takeaway],['Confidence certificate',c.version],['Input classification',c.classification],['Certificate scope',c.subject],['Checks',confidenceStatus(c)],['Certificate JSON',JSON.stringify(c)]];
}
