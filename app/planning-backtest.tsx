'use client';
import { useEffect,useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { project,type Goal } from '@/lib/planning/core';
import type { RunSummary,SavedResearch } from '@/lib/finance/research';
import { friendlyError } from '@/lib/client-errors';
const money=(v:string)=>{const n=BigInt(v);return `$${(n/100n).toLocaleString('en-US')}.${(n%100n).toString().padStart(2,'0')}`;};
export default function PlanningBacktest({goal,initial,months,onBacktests}:{goal?:Goal;initial?:string;months?:number;onBacktests:()=>void}){
 const [runs,setRuns]=useState<RunSummary[]>([]),[selected,setSelected]=useState(''),[run,setRun]=useState<SavedResearch|null>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();void fetch('/api/research',{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json() as {runs:RunSummary[];error?:string};if(!r.ok)throw new Error(d.error);if(!c.signal.aborted)setRuns(d.runs);}).catch(e=>{if(!c.signal.aborted)setError(friendlyError(e));});return()=>c.abort();},[]);
 useEffect(()=>{if(!selected)return;const c=new AbortController();void fetch('/api/research?id='+selected,{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json() as {run:SavedResearch;error?:string};if(!r.ok)throw new Error(d.error);if(!c.signal.aborted)setRun(d.run);}).catch(e=>{if(!c.signal.aborted)setError(friendlyError(e));});return()=>c.abort();},[selected]);
 const active=run?.id===selected?run:null,shockBps=active?Math.max(-10000,Math.round(active.analysis.full.strategy.maxDrawdown*100)):0;
 const starting=initial?(BigInt(initial)*BigInt(10000+shockBps)+5000n)/10000n:0n,result=goal&&active?project(starting.toString(),goal.monthly,months??0,goal.returnBps,goal.feeBps):null;
 return <section className="panel plan-panel"><h2>Could my goal withstand a past backtest’s worst drop?</h2><p>Apply a saved strategy’s largest historical decline to the goal’s starting balance. Keep your future contribution, return and fee assumptions unchanged.</p>{!goal?<p>Choose a goal above to use this comparison.</p>:runs.length?<label className="plan-inline-label">Saved backtest<NativeSelect value={selected} onChange={e=>{setSelected(e.target.value);setError('');}}><option value="">Choose a backtest</option>{runs.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></label>:<Button variant="outline" onClick={onBacktests}>Create a backtest</Button>}{error&&<p role="alert">{error}</p>}{active&&result&&goal&&<div className="plan-insight"><strong>{money(result.ending)} at your goal date after a {(shockBps/100).toFixed(2)}% starting shock</strong><p>{BigInt(result.ending)>=BigInt(goal.target)?'Still reaches':'Does not reach'} your {money(goal.target)} target under these assumptions. The shock comes from {active.start} to {active.end}.{active.analysis.synthetic?' This backtest uses fictional data.':''}</p><p>This is one sensitivity check, not a forecast or a worst-case bound. A future loss could be larger. The backtest’s return is never automatically treated as an expected annual return.</p></div>}</section>;
}
