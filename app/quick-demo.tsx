'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, FlaskConical, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { calculateDemo, DEMO_COSTS, demoDifference, demoReport, type DemoCost } from '@/lib/finance/quick-demo';
import ConfidenceCertificate from './confidence-certificate';
import { costDemoCertificate } from '@/lib/finance/confidence';
import type { SavedResearch } from '@/lib/finance/research';

const money = (value: string) => {
  const cents = BigInt(value), absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '−' : ''}$${(absolute / 100n).toLocaleString('en-US')}.${(absolute % 100n).toString().padStart(2,'0')}`;
};
const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

export function QuickDemoEntry({ onStart }: { onStart: () => void }) {
  return <section className="quick-demo-entry" aria-labelledby="demo-entry-title">
    <div className="quick-demo-icon"><FlaskConical size={24}/></div>
    <div><span className="quick-demo-kicker">TRY MARKETLAB · FICTIONAL DATA</span><h2 id="demo-entry-title">What can trading costs change?</h2><p>Run a sample experiment. See the result with and without costs, using the same prices and rule.</p><span className="quick-demo-entry-note">No uploads or market-data key needed.</span></div>
    <Button onClick={onStart}><Play size={16}/> Run sample experiment</Button>
  </section>;
}

function CostChart({ baseline, selected }: { baseline: SavedResearch; selected: SavedResearch }) {
  const rows = baseline.analysis.full.strategy.history, other = selected.analysis.full.strategy.history;
  const values = [...rows,...other].map(row => Number(row.value) / 100), low = Math.min(10000,...values), high = Math.max(10000,...values), pad = Math.max((high-low)*.12,10);
  const x = (i: number) => 82 + i / Math.max(1,rows.length-1)*728;
  const y = (value: string) => 18 + (high+pad-Number(value)/100)/(high-low+2*pad)*214;
  const path = (points: typeof rows) => points.map((point,i) => `${i?'L':'M'}${x(i)},${y(point.value)}`).join(' ');
  return <div className="quick-demo-chart"><div className="quick-demo-legend"><span><i className="demo-line-free"/> Without costs</span><span><i className="demo-line-cost"/> Selected costs</span></div>
    <svg viewBox="0 0 850 278" role="img" aria-label={`Fictional strategy value: without costs ends at ${money(rows.at(-1)!.value)}; selected costs ends at ${money(other.at(-1)!.value)}. Exact observations are in the table below.`}>
      {[0,.5,1].map(f => {const value=low+(high-low)*f,cy=y(String(Math.round(value*100)));return <g key={f}><line x1="82" x2="810" y1={cy} y2={cy} stroke="#e3e9e5" strokeDasharray="3 5"/><text x="70" y={cy+4} textAnchor="end" fontSize="13" fill="#536b5c">${Math.round(value).toLocaleString('en-US')}</text></g>;})}
      <path d={path(rows)} fill="none" stroke="#7082a3" strokeWidth="2.5" strokeDasharray="7 5"/>
      <path d={path(other)} fill="none" stroke="#206d55" strokeWidth="3" strokeLinejoin="round"/>
      <circle cx={x(other.length-1)} cy={y(other.at(-1)!.value)} r="4" fill="#206d55"/>
      <text x="82" y="267" fontSize="13" fill="#536b5c">{rows[0].date}</text><text x="810" y="267" textAnchor="end" fontSize="13" fill="#536b5c">{rows.at(-1)!.date}</text>
    </svg></div>;
}

type Results = Record<DemoCost, SavedResearch>;
export default function QuickDemo({ onOpenData }: { onOpenData: () => void }) {
  const [cost,setCost] = useState<DemoCost>('illustrative'), [results,setResults] = useState<Results|null>(null), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null), focused = useRef(false);
  useEffect(() => {
    let active = true;
    void Promise.all(DEMO_COSTS.map(item=>calculateDemo(item.id))).then(runs => {
      if(active){setResults(Object.fromEntries(DEMO_COSTS.map((item,i)=>[item.id,runs[i]])) as Results);setError('');}
    }).catch((e: unknown) => {if(active)setError(e instanceof Error?e.message:'The sample calculation could not finish.');});
    return () => {active=false;};
  },[retry]);
  useEffect(() => {if(results&&!focused.current){heading.current?.focus({preventScroll:true});focused.current=true;}},[results]);
  const current = results ? {baseline:results.zero,selected:results[cost]} : null;
  if(error)return <div className="panel quick-demo-error" role="alert"><h2>We couldn’t calculate the sample.</h2><p>{error}</p><Button onClick={() => {setError('');setRetry(n=>n+1);}}>Retry demo</Button></div>;
  if(!current)return <div className="panel quick-demo-loading" role="status"><FlaskConical size={24}/><p>Calculating the same rule with and without trading costs…</p></div>;
  const {baseline,selected} = current, base=baseline.analysis.full.strategy, model=selected.analysis.full.strategy;
  const difference=demoDifference(baseline,selected), delta=BigInt(difference), amount=money((delta<0n?-delta:delta).toString());
  const config=selected.snapshot.config;
  function download() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(demoReport(selected),null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`marketlab-fictional-demo-${cost}.json`;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="quick-demo" data-demo-ready="true">
    <section className="quick-demo-takeaway" aria-labelledby="quick-demo-takeaway">
      <span className="quick-demo-kicker"><FlaskConical size={15}/> FICTIONAL EXPERIMENT · $10,000 STARTING CASH</span>
      <h2 id="quick-demo-takeaway" ref={heading} tabIndex={-1}>{delta===0n?'Same costs. Same outcome.':`Trading costs left ${amount} ${delta>0n?'less':'more'} at the end.`}</h2>
      <p>{delta===0n?'Both runs now use zero fees and zero slippage, so their results match.':`The prices and trading rule stayed identical. ${model.trades.length} trades, fees and less favorable execution prices changed the ending value.`}</p>
      <div className="quick-demo-context"><span>Invented XDEMO prices</span><span>3-observation moving average</span><span>{selected.analysis.full.observations} evaluated observations</span></div>
    </section>

    <div className="quick-demo-controls"><label htmlFor="demo-costs">Change the trading costs<NativeSelect id="demo-costs" value={cost} onChange={e=>setCost(e.target.value as DemoCost)}>{DEMO_COSTS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</NativeSelect></label><p>Fees are charged per trade. Slippage means buying a little higher or selling a little lower than the quoted price. These settings are illustrative.</p></div>

    <div className="quick-demo-metrics" aria-label="Calculated demo comparison">
      <section><span>Without costs</span><strong>{money(base.history.at(-1)!.value)}</strong><p>{pct(base.returnPct)} return</p><small>{base.trades.length} trades · $0.00 in fees</small></section>
      <section className="quick-demo-selected"><span>With selected costs</span><strong>{money(model.history.at(-1)!.value)}</strong><p>{pct(model.returnPct)} return</p><small>{model.trades.length} trades · {money(model.fees)} in fees</small></section>
      <section><span>Difference in ending value</span><strong>{money(difference)}</strong><p>{(base.returnPct-model.returnPct).toFixed(2)} percentage points</p><small>Includes fees, slippage and their effect on position size.</small></section>
    </div>

    <section className="panel"><div className="panel-heading"><div><h2>One rule. Two cost assumptions.</h2><p>Fictional strategy value · {selected.start} to {selected.end}</p></div><span className="research-kind">SYNTHETIC INPUTS</span></div><CostChart baseline={baseline} selected={selected}/><p className="quick-demo-chart-note">The rule holds stock when the prior close was above its trailing average; otherwise it holds cash. It trades at the next supplied close. Both paths start with $10,000.</p></section>

    <ConfidenceCertificate certificate={costDemoCertificate(selected)}/>
    <section className="quick-demo-explainer"><div><h2>The lesson</h2><p>A strategy’s return depends on how its trades are executed. Always include costs before judging a result.</p></div><div><h2>What this example means</h2><p>These choppy prices were invented to make repeated trading easy to see. The result teaches a calculation; it provides no evidence that this rule would succeed with real prices.</p></div></section>

    <section className="panel quick-demo-evidence"><details><summary>Inspect the inputs, assumptions & exact values</summary><div className="quick-demo-assumptions"><p><strong>Inputs:</strong> {selected.snapshot.asset.dataset.count} invented weekday closes for XDEMO, including warmup. No splits or dividends exist in this fictional instrument. This is not an exchange calendar.</p><p><strong>Selected costs:</strong> {(config.feeBps/100).toFixed(2)}% fee and {(config.slippageBps/100).toFixed(2)}% adverse price slippage per trade. No leverage, shorting, taxes, cash interest or forced sale at the end.</p><p><strong>Reproducibility:</strong> The download contains every input, calculated observation and assumption. This demonstration does not save datasets, trades or experiments to your workspace.</p><p><strong>Fixture version:</strong> {demoReport(selected).demo.version}</p></div>
      <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="numeric">Fictional close</TableHead><TableHead className="numeric">Value without costs</TableHead><TableHead className="numeric">Value with selected costs</TableHead></TableRow></TableHeader><TableBody>{base.history.map((row,i)=><TableRow key={row.date}><TableCell>{row.date}</TableCell><TableCell className="numeric">{money((BigInt(selected.snapshot.asset.dataset.observations[i+config.window].priceMicros)/10000n).toString())}</TableCell><TableCell className="numeric">{money(row.value)}</TableCell><TableCell className="numeric">{money(model.history[i].value)}</TableCell></TableRow>)}</TableBody></Table>
    </details></section>

    <div className="quick-demo-actions"><Button onClick={onOpenData}>Try your own historical data <ArrowRight size={16}/></Button><Button variant="outline" onClick={download}><Download size={16}/> Download sample report</Button><Button variant="ghost" onClick={()=>setCost('illustrative')} disabled={cost==='illustrative'}><RotateCcw size={16}/> Reset demo</Button></div>
    <p className="quick-demo-footnote">Runs in your browser. Fictional results are separate from provider prices and your portfolio. No market-data connection is needed.</p>
  </div>;
}
