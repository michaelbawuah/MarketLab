import { validateImport,datasetId } from '../../lib/finance/market-data.ts';
import type { ResearchSnapshot } from '../../lib/finance/research.ts';
import { RESEARCH_METHOD } from '../../lib/finance/research.ts';
export async function researchFixture(count=8):Promise<ResearchSnapshot>{
  const fixed=[90,100,120,60,55,65,50,60],dates=Array.from({length:count},(_,i)=>new Date(Date.UTC(2016,0,1+i)).toISOString().slice(0,10));
  const prices=count===8?fixed:dates.map((_,i)=>100+(i%2)*.01+i*.0001);
  const input=validateImport({symbol:'XTEST',source:'Fictional infrastructure fixture',basis:'raw',priceColumn:'close',kind:'synthetic',csv:'date,close\n'+dates.map((d,i)=>`${d},${prices[i].toFixed(4)}`).join('\n')});
  const dataset={...input,id:await datasetId(input),count,firstDate:dates[0],lastDate:dates.at(-1)!,created:'2026-09-24T00:00:00Z'};
  const events=count===8?[{date:dates[3],type:'split' as const,newShares:'2',oldShares:'1',amount:''},{date:dates[4],type:'dividend' as const,newShares:'',oldShares:'',amount:'1'}]:[];
  const binding={dataset,actions:{source:'Fictional fixture events',complete:true as const,events,revision:1,updated:'2026-09-24T00:00:00Z'}};
  return {method:RESEARCH_METHOD,config:{name:'Infrastructure fixture',assetId:dataset.id,benchmarkId:dataset.id,start:dates[2],end:dates.at(-1)!,holdoutStart:dates[Math.floor(count*.7)],window:2,initialCash:'1200',feeBps:0,slippageBps:0,confirmed:true},asset:binding,benchmark:binding};
}
