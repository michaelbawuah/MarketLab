import { analyze, type Quote, type Transaction } from './core.ts';
export const FIRST_DATE = '2026-04-01';
export const LAST_DATE = '2026-09-24';
export const DATASET = 'synthetic-daily-v1';
export const assets = [
  { symbol:'AAPL', name:'Apple Inc.', sector:'Technology', color:'#5770ba', start:16000, trend:.15 },
  { symbol:'MSFT', name:'Microsoft', sector:'Technology', color:'#278871', start:32000, trend:.19 },
  { symbol:'NVDA', name:'NVIDIA', sector:'Technology', color:'#93a65c', start:10500, trend:.32 },
  { symbol:'AMZN', name:'Amazon', sector:'Consumer discretionary', color:'#c59159', start:18000, trend:.11 },
  { symbol:'GOOGL', name:'Alphabet', sector:'Communication services', color:'#9b79b8', start:15100, trend:.08 },
  { symbol:'SPY', name:'S&P 500 ETF proxy', sector:'Diversified ETF', color:'#809297', start:51000, trend:.13 },
];
/** Deliberately fictional weekday observations, not exchange sessions or market prices. */
export function demoQuotes(): Quote[] {
  const days:string[]=[];
  for(let d=new Date(FIRST_DATE+'T00:00:00Z');d.toISOString().slice(0,10)<=LAST_DATE;d.setUTCDate(d.getUTCDate()+1)) {
    if(d.getUTCDay()!==0 && d.getUTCDay()!==6) days.push(d.toISOString().slice(0,10));
  }
  return assets.flatMap((a,j)=>days.map((date,i)=>{
    const wave=.015*(Math.sin(i*.28+j)-Math.sin(j))+.008*Math.sin(i*1.33+j)*Math.sin(i*.07);
    const dip=-.047*Math.exp(-(((i-51)/11)**2))+.047*Math.exp(-((51/11)**2));
    const close=Math.round(a.start*(1+a.trend*i/(days.length-1)+wave+dip));
    return {symbol:a.symbol,date,close:String(close)};
  }));
}
export function demoTransactions(): Transaction[] {
  const tx=(id:string,date:string,kind:Transaction['kind'],symbol:string,units:string,amount:string,fee='0'):Transaction=>({id,date,kind,symbol,units,amount,fee});
  return [tx('seed-0',FIRST_DATE,'deposit','','0','6500000'),
    tx('seed-1',FIRST_DATE,'buy','MSFT','80000000','2560000','100'),
    tx('seed-2',FIRST_DATE,'buy','AAPL','75000000','1200000','100'),
    tx('seed-3',FIRST_DATE,'buy','NVDA','45000000','472500','100'),
    tx('seed-4',FIRST_DATE,'buy','AMZN','40000000','720000','100'),
    tx('seed-5',FIRST_DATE,'buy','SPY','15000000','765000','100'),
    tx('seed-6','2026-06-01','deposit','','0','500000'),
    tx('seed-7','2026-06-01','buy','GOOGL','25000000',demoQuotes().find(q=>q.symbol==='GOOGL'&&q.date==='2026-06-01')!.close.replace(/^/,''),'100'),
    tx('seed-8','2026-07-15','dividend','MSFT','0','6800'),
  ].map(t=>t.id==='seed-7'?{...t,amount:String(BigInt(t.amount)*25n)}:t);
}
export type PipelineRun = { id:string; started:string; status:string; records:number; inserted:number; duration:number; message:string };
export type Workspace = { analytics:ReturnType<typeof analyze>; transactions:Transaction[]; quotes:Quote[]; version:number; pipeline:{ stored:number; expected:number; runs:PipelineRun[] } };
export function initialWorkspace():Workspace {
 const quotes=demoQuotes(),transactions=demoTransactions();
 return {analytics:analyze(transactions,quotes),transactions,quotes,version:0,pipeline:{stored:0,expected:quotes.length,runs:[]}};
}
