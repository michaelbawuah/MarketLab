import type { PortfolioAnalysis } from '../finance/historical-portfolio.ts';
export type StrategyTemplate={id:string;title:string;window:number;feeBps:number;slippageBps:number};
export const starterStrategies:StrategyTemplate[]=[{id:'trend-20',title:'Shorter trend · 20 prices',window:20,feeBps:10,slippageBps:5},{id:'trend-50',title:'Medium trend · 50 prices',window:50,feeBps:10,slippageBps:5},{id:'trend-200',title:'Longer trend · 200 prices',window:200,feeBps:10,slippageBps:5}];
export const goalGroups=['retirement','home','target'] as const;
export const riskGroups=['lower','moderate','higher'] as const;
export function priorQuarter(now=new Date()){
 const y=now.getUTCFullYear(),q=Math.floor(now.getUTCMonth()/3),start=new Date(Date.UTC(y,q*3-3,1)),end=new Date(Date.UTC(y,q*3,0));
 return {id:`${start.getUTCFullYear()}-Q${Math.floor(start.getUTCMonth()/3)+1}`,start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}
export function eligiblePeerReturn(a:PortfolioAnalysis,period:ReturnType<typeof priorQuarter>){
 if(a.synthetic)throw new Error('Practice portfolios cannot contribute to peer comparisons.');
 const before=a.history.filter(p=>p.date<period.start).at(-1),last=a.history.filter(p=>p.date<=period.end).at(-1);
 if(!before||!last||a.history.at(-1)!.date<period.end||Date.parse(period.start)-Date.parse(before.date)>7*86400000||Date.parse(period.end)-Date.parse(last.date)>7*86400000)throw new Error(`Import portfolio history covering the full ${period.id} quarter, including a closing value before ${period.start}.`);
 const beginning=1+before.returnPct/100,ending=1+last.returnPct/100,value=(ending/beginning-1)*100;
 if(beginning<=0||!Number.isFinite(value)||value< -100||value>100)throw new Error('This quarterly return is outside the supported peer-comparison range.');
 return Math.round(value*100);
}
export function validateCohort(goal:unknown,risk:unknown){if(!goalGroups.includes(goal as typeof goalGroups[number])||!riskGroups.includes(risk as typeof riskGroups[number]))throw new Error('Choose one goal and risk description.');return `${goal}:${risk}`;}
