import { z } from 'zod';
import type { PortfolioAnalysis } from '../finance/historical-portfolio.ts';

export const classes = ['stocks','bonds','cash','crypto','property','other'] as const;
export type AssetClass = typeof classes[number];
export const classLabels:Record<AssetClass,string> = {stocks:'Stocks & funds',bonds:'Bonds',cash:'Cash',crypto:'Crypto',property:'Property',other:'Other assets'};
const cents = z.string().regex(/^(0|[1-9]\d{0,13})$/, 'Use a valid dollar amount.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'Choose a valid date.');
const name = z.string().trim().min(2).max(80).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const accountSchema = z.object({id,name,kind:z.enum(['brokerage','retirement','bank','crypto','property','debt','other']),asOf:date,
 values:z.object({stocks:cents,bonds:cents,cash:cents,crypto:cents,property:cents,other:cents}).strict(),
 debt:cents,feesPaid:cents.nullable(),annualFeeBps:z.number().int().min(0).max(500).nullable(),
}).strict();
export const goalSchema = z.object({id,name,kind:z.enum(['retirement','home','target']),target:cents.refine(v=>BigInt(v)>0n),date,
 monthly:cents,accountIds:z.array(id).max(26),returnBps:z.number().int().min(-2000).max(2000),feeBps:z.number().int().min(0).max(500),inflationBps:z.number().int().min(0).max(1500),
}).strict();
const targetSchema=z.object({stocks:z.number().int().min(0).max(10000),bonds:z.number().int().min(0).max(10000),cash:z.number().int().min(0).max(10000),crypto:z.number().int().min(0).max(10000),property:z.number().int().min(0).max(10000),other:z.number().int().min(0).max(10000)}).strict();
export const planSchema=z.object({version:z.literal(1),accounts:z.array(accountSchema).max(25),goals:z.array(goalSchema).max(10),
 includePortfolio:z.boolean(),portfolioClass:z.enum(classes),target:targetSchema.nullable(),thresholdBps:z.number().int().min(100).max(2500),alertsEnabled:z.boolean(),
}).strict();
export type Account=z.infer<typeof accountSchema>;
export type Goal=z.infer<typeof goalSchema>;
export type Plan=z.infer<typeof planSchema>;
export type LinkedPortfolio={name:string;asOf:string;analysis:PortfolioAnalysis}|null;
export type SavedPlan={revision:number;updated:string|null;plan:Plan;portfolio:LinkedPortfolio};
export const emptyValues=():Record<AssetClass,string>=>({stocks:'0',bonds:'0',cash:'0',crypto:'0',property:'0',other:'0'});
export function emptyPlan():Plan{return {version:1,accounts:[],goals:[],includePortfolio:true,portfolioClass:'other',target:null,thresholdBps:500,alertsEnabled:true};}
export function validatePlan(value:unknown,today=new Date().toISOString().slice(0,10)):Plan {
 const result=planSchema.safeParse(value);if(!result.success)throw new Error('Check the names, dollar amounts, dates and percentages in your plan.');
 const p=result.data,ids=new Set(p.accounts.map(a=>a.id));
 if(ids.size!==p.accounts.length||ids.has('portfolio')||new Set(p.goals.map(g=>g.id)).size!==p.goals.length)throw new Error('Each account and goal needs a unique name record.');
 if(p.accounts.some(a=>a.asOf>today))throw new Error('Account balances need a date no later than today.');
 for(const a of p.accounts){const assets=classes.reduce((sum,k)=>sum+BigInt(a.values[k]),0n);if(a.kind==='debt'&&assets>0n||a.kind!=='debt'&&BigInt(a.debt)>0n)throw new Error('Keep amounts owed in a separate debt account.');}
 const latest=new Date(today+'T00:00:00Z');latest.setUTCFullYear(latest.getUTCFullYear()+60);
 for(const g of p.goals){if(g.date<'2000-01-01'||g.date>latest.toISOString().slice(0,10))throw new Error('Goal dates must be between 2000 and 60 years from today.');if(new Set(g.accountIds).size!==g.accountIds.length||g.accountIds.some(i=>i!=='portfolio'&&!ids.has(i)))throw new Error('Choose existing accounts for each goal.');}
 if(p.target&&classes.reduce((s,k)=>s+p.target![k],0)!==10000)throw new Error('Target allocation must add up to 100%.');
 if(p.accounts.reduce((s,a)=>s+classes.reduce((v,k)=>v+BigInt(a.values[k]),0n)+BigInt(a.debt),0n)>1000000000000000n)throw new Error('The combined balances exceed the supported limit.');
 return p;
}
const round=(n:bigint,d:bigint)=>n<0n?-((-n+d/2n)/d):(n+d/2n)/d;
export function aggregate(p:Plan,portfolio:LinkedPortfolio,today=new Date().toISOString().slice(0,10)) {
 const accounts=p.accounts.map(a=>({...a,source:'manual' as const}));
 // Practice records must never silently become someone's real net worth.
 if(p.includePortfolio&&portfolio&&!portfolio.analysis.synthetic){const a=portfolio.analysis,v=emptyValues();v.cash=a.cash;v[p.portfolioClass]=(BigInt(v[p.portfolioClass])+BigInt(a.value)-BigInt(a.cash)).toString();accounts.push({id:'portfolio',name:portfolio.name,kind:'brokerage',asOf:portfolio.asOf,values:v,debt:'0',feesPaid:a.fees,annualFeeBps:null,source:'manual'});}
 const values=emptyValues();let assets=0n,debt=0n,fees=0n,unknownFees=0;
 for(const a of accounts){for(const k of classes){values[k]=(BigInt(values[k])+BigInt(a.values[k])).toString();assets+=BigInt(a.values[k]);}debt+=BigInt(a.debt);if(a.kind!=='debt'){if(a.feesPaid===null)unknownFees++;else fees+=BigInt(a.feesPaid);}}
 const allocation=classes.map(k=>{const actual=assets>0n?Number(round(BigInt(values[k])*10000n,assets)):0,target=p.target?.[k]??null;return {key:k,label:classLabels[k],value:values[k],actualBps:actual,targetBps:target,driftBps:target===null?null:actual-target};});
 const stale=accounts.filter(a=>(Date.parse(today+'T00:00:00Z')-Date.parse(a.asOf+'T00:00:00Z'))/86400000>31);
 const drift=p.alertsEnabled&&assets>0n?allocation.filter(a=>a.driftBps!==null&&Math.abs(a.driftBps)>=p.thresholdBps):[];
 return {accounts,values,assets:assets.toString(),debt:debt.toString(),netWorth:(assets-debt).toString(),feesPaid:fees.toString(),unknownFees,allocation,stale,drift,
 oldest:accounts.map(a=>a.asOf).sort()[0]??null,newest:accounts.map(a=>a.asOf).sort().at(-1)??null};
}
export type Projection={ending:string;contributed:string;fees:string;points:{month:number;value:string;contributed:string}[]};
/** Hypothetical nominal annual rate / 12, end-of-month contributions,
 * fees on the post-growth balance. Each monthly amount rounds to cents. */
export function project(initial:string,monthly:string,months:number,returnBps:number,feeBps:number):Projection {
 if(!/^\d{1,16}$/.test(initial)||!/^\d{1,14}$/.test(monthly)||!Number.isInteger(months)||months<0||months>720||!Number.isInteger(returnBps)||returnBps< -2000||returnBps>2000||!Number.isInteger(feeBps)||feeBps<0||feeBps>500)throw new Error('These projection settings are outside the supported range.');
 let value=BigInt(initial),contributed=value,fees=0n;const addition=BigInt(monthly),points=[{month:0,value:value.toString(),contributed:contributed.toString()}];
 for(let month=1;month<=months;month++){value+=round(value*BigInt(returnBps),120000n);const fee=round(value*BigInt(feeBps),120000n);fees+=fee;value=value-fee+addition;contributed+=addition;if(value>10n**24n)throw new Error('This projection is too large. Shorten the time span or lower the assumed return.');points.push({month,value:value.toString(),contributed:contributed.toString()});}
 return {ending:value.toString(),contributed:contributed.toString(),fees:fees.toString(),points};
}
export function monthsUntil(date:string,today:string){const a=new Date(today+'T00:00:00Z'),b=new Date(date+'T00:00:00Z');return Math.max(0,Math.min(720,(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()-(b.getUTCDate()<a.getUTCDate()?1:0)));}
export function goalResult(g:Goal,total:ReturnType<typeof aggregate>,today=new Date().toISOString().slice(0,10)){
 const chosen=total.accounts.filter(a=>g.accountIds.includes(a.id)&&a.kind!=='debt'),initial=chosen.reduce((s,a)=>s+classes.reduce((v,k)=>v+BigInt(a.values[k]),0n),0n).toString(),months=monthsUntil(g.date,today);
 const baseline=project(initial,g.monthly,months,g.returnBps,g.feeBps),low=project(initial,g.monthly,months,Math.max(-2000,g.returnBps-300),g.feeBps),high=project(initial,g.monthly,months,Math.min(2000,g.returnBps+300),g.feeBps);
 const target=BigInt(g.target),ending=BigInt(baseline.ending);let needed:bigint|null=null;
 if(ending>=target)needed=BigInt(g.monthly);else if(months){let lo=BigInt(g.monthly),hi=9999999999999n;if(BigInt(project(initial,hi.toString(),months,g.returnBps,g.feeBps).ending)>=target){while(lo<hi){const mid=(lo+hi)/2n;if(BigInt(project(initial,mid.toString(),months,g.returnBps,g.feeBps).ending)>=target)hi=mid;else lo=mid+1n;}needed=lo;}}
 const deflator=project('100000000','0',months,g.inflationBps,0).ending;
 return {initial,months,baseline,low,high,onTrack:ending>=target,gap:(target-ending).toString(),neededMonthly:needed?.toString()??null,todaysDollars:round(ending*100000000n,BigInt(deflator)).toString(),progress:Math.min(100,Number(BigInt(initial)*10000n/target)/100)};
}
export function feeImpact(initial:string,monthly:string,months:number,returnBps:number,feeBps:number){const gross=project(initial,monthly,months,returnBps,0),net=project(initial,monthly,months,returnBps,feeBps),drag=BigInt(gross.ending)-BigInt(net.ending);return {gross,net,drag:drag.toString(),lostGrowth:(drag-BigInt(net.fees)).toString()};}
export function stress(total:ReturnType<typeof aggregate>,shocks:Record<AssetClass,number>){let before=0n,after=0n;for(const k of classes){if(!Number.isInteger(shocks[k])||shocks[k]< -10000||shocks[k]>10000)throw new Error('Use a change from -100% to 100% for each asset class.');const v=BigInt(total.values[k]);before+=v;after+=v+round(v*BigInt(shocks[k]),10000n);}return {before:before.toString(),after:after.toString(),change:(after-before).toString(),netWorth:(after-BigInt(total.debt)).toString()};}
/** Uses the existing portfolio engine's flow-adjusted return index. It is a
 * hypothetical exposure overlay, not a reconstruction of executable trades. */
export function extraContributions(history:PortfolioAnalysis['history'],monthly:string,start:string,end:string){
 if(!/^\d{1,14}$/.test(monthly)||start>end)throw new Error('Choose a valid contribution and date range.');
 const points=history.filter(p=>p.date>=start&&p.date<=end);if(points.length<2||!history.length||start<history[0].date||end>history.at(-1)!.date)throw new Error('Choose dates covered by your imported portfolio history.');
 let value=0n,paid=0n,lastMonth='',previous=1+points[0].returnPct/100;const output:{date:string;value:string}[]=[];
 for(const p of points){const index=1+p.returnPct/100;if(!Number.isFinite(index)||index<=0||previous<=0)throw new Error('This period cannot support a contribution comparison.');value=round(value*BigInt(Math.round(index/previous*1e12)),1000000000000n);const month=p.date.slice(0,7);if(month!==lastMonth){value+=BigInt(monthly);paid+=BigInt(monthly);lastMonth=month;}output.push({date:p.date,value:value.toString()});previous=index;}
 return {value:value.toString(),contributed:paid.toString(),gain:(value-paid).toString(),points:output};
}
export function planScore(total:ReturnType<typeof aggregate>,p:Plan){
 if(BigInt(total.assets)===0n)return null;
 // Transparent checklist, deliberately not a risk rating or investment ranking.
 const items=[{label:'Balances updated within 31 days',points:25,met:total.stale.length===0},{label:'Fees recorded for every asset account',points:25,met:total.unknownFees===0},{label:'An allocation target is saved',points:25,met:!!p.target},{label:'A goal is linked to saved accounts',points:25,met:p.goals.some(g=>g.accountIds.some(i=>total.accounts.some(a=>a.id===i&&a.kind!=='debt')))}];
 return {value:items.reduce((n,i)=>n+(i.met?i.points:0),0),items};
}
