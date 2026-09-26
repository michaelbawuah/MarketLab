'use client';
import { useEffect, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { compareResearch, type ResearchPeriod } from '@/lib/finance/research-comparison';
import type { RunSummary, SavedResearch } from '@/lib/finance/research';

const percent = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const points = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)} pp`;
// Preserve exact saved cents, including signed differences.
function money(value: string, signed = false) {
  const cents = BigInt(value), absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '−' : signed && cents > 0n ? '+' : ''}$${(absolute / 100n).toLocaleString('en-US')}.${(absolute % 100n).toString().padStart(2, '0')}`;
}
const periods = { full: 'Full period', development: 'Earlier period', holdout: 'Later period · fresh cash' };
type Loaded = { id: string; run?: SavedResearch; error?: string };

export default function ResearchComparison({ active, runs, period }: { active: SavedResearch; runs: RunSummary[]; period: ResearchPeriod }) {
  const [selected, setSelected] = useState(''), [loaded, setLoaded] = useState<Loaded | null>(null), [retry, setRetry] = useState(0);
  const others = runs.filter(r => r.id !== active.id);
  const requested = others.some(r => r.id === selected) ? selected : '';
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    void fetch(`/api/research?id=${encodeURIComponent(requested)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { run?: SavedResearch; error?: string };
        if (!response.ok || !data.run || data.run.id !== requested) throw new Error(data.error || 'Could not load this saved experiment.');
        if (!controller.signal.aborted) setLoaded({ id: requested, run: data.run });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ id: requested, error: error instanceof Error ? error.message : 'Could not load this saved experiment.' });
      });
    return () => controller.abort();
  }, [requested, retry]);
  const other = loaded?.id === requested ? loaded.run : undefined;
  const error = loaded?.id === requested ? loaded.error : undefined;
  const comparison = other ? compareResearch(active, other, period) : null;
  const delta = comparison?.delta;
  const measures = comparison ? [
    ['Return after costs', percent(comparison.left.strategy.returnPct), percent(comparison.right.strategy.returnPct), delta ? points(delta.returnPp) : '—'],
    ['Largest observed drawdown', percent(comparison.left.strategy.maxDrawdown), percent(comparison.right.strategy.maxDrawdown), delta ? points(delta.drawdownPp) : '—'],
    ['Ending value', money(comparison.left.strategy.history.at(-1)!.value), money(comparison.right.strategy.history.at(-1)!.value), delta ? money(delta.endingValue, true) : '—'],
    ['Executed trades', String(comparison.left.strategy.trades.length), String(comparison.right.strategy.trades.length), delta ? `${delta.trades > 0 ? '+' : ''}${delta.trades}` : '—'],
    ['Total fees', money(comparison.left.strategy.fees), money(comparison.right.strategy.fees), delta ? money(delta.fees, true) : '—'],
  ] : [];

  return <section className="panel experiment-comparison" aria-labelledby="compare-heading">
    <div className="panel-heading"><div><h2 id="compare-heading"><GitCompareArrows size={19}/> Compare saved experiments</h2><p>Inspect a different window or cost assumption using frozen results.</p></div></div>
    <div className="comparison-controls"><label htmlFor="compare-run">Compare with</label><NativeSelect id="compare-run" value={requested} disabled={!others.length} onChange={event => { setLoaded(null); setSelected(event.target.value); }}>
      <option value="">{others.length ? 'Choose another saved experiment…' : 'Save a second experiment to compare'}</option>
      {others.map(r => <option key={r.id} value={r.id}>{r.name} · {r.symbol} / {r.benchmark} · {r.id.slice(0, 8)}</option>)}
    </NativeSelect>{requested && <Button variant="ghost" onClick={() => { setSelected(''); setLoaded(null); }}>Clear comparison</Button>}</div>
    {!requested && <p className="comparison-note">Open New experiment to copy the current settings, change the window or costs, and save a second run. Both saved experiments remain unchanged.</p>}
    {requested && !other && !error && <p className="comparison-note" role="status">Loading comparison…</p>}
    {error && <div className="comparison-error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => { setLoaded(null); setRetry(n => n + 1); }}>Retry comparison</Button></div>}
    {other && comparison && <>
      <div className={`comparison-context ${comparison.aligned ? '' : 'comparison-mismatch'}`}>
        <strong>{comparison.aligned ? 'Matched inputs and evaluation dates' : 'Different research setups'}</strong>
        <p>{comparison.aligned ? 'Differences below are comparison minus current. They describe these saved observations.' : 'Individual results are shown for inspection. Differences are withheld because these setups are not directly matched.'}</p>
        {comparison.differences.length > 0 && <ul>{comparison.differences.map(text => <li key={text}>{text}</li>)}</ul>}
        <div className="comparison-changes">{comparison.changes.length ? comparison.changes.map(text => <span key={text}>{text}</span>) : <span>Same SMA window, fee and slippage settings</span>}</div>
        {comparison.changes.length > 1 && <p>Multiple settings changed; a result difference cannot be attributed to one setting.</p>}
        {(active.analysis.synthetic || other.analysis.synthetic) && <p><strong>Contains fictional price inputs.</strong></p>}
      </div>
      <div className="comparison-period"><strong>{periods[period]}</strong><span>Uses the evaluation period selected above.</span></div>
      <Table><TableHeader><TableRow><TableHead>Strategy measure</TableHead>{[active, other].map((r, i) => <TableHead key={r.id} className="numeric comparison-column"><span>{i ? 'Comparison' : 'Current'}</span><strong>{r.name}</strong><small>{r.id.slice(0, 8)}</small></TableHead>)}<TableHead className="numeric">Difference</TableHead></TableRow></TableHeader><TableBody>
        {measures.map(([label, left, right, difference]) => <TableRow key={label}><TableCell>{label}</TableCell><TableCell className="numeric">{left}</TableCell><TableCell className="numeric">{right}</TableCell><TableCell className="numeric">{difference}</TableCell></TableRow>)}
      </TableBody></Table>
      <p className="comparison-note">A positive drawdown difference means a smaller observed decline. Fees exclude slippage, which is already reflected in returns. Results are hypothetical; repeated trials can overfit the later period.</p>
      <details className="comparison-inputs"><summary>Compare settings & frozen inputs</summary><Table><TableHeader><TableRow><TableHead>Setting</TableHead><TableHead>Current</TableHead><TableHead>Comparison</TableHead></TableRow></TableHeader><TableBody>
        {([
          ['Calculation method', active.snapshot.method, other.snapshot.method],
          ['SMA window', `${active.snapshot.config.window} observations`, `${other.snapshot.config.window} observations`],
          ['Starting cash', `$${active.snapshot.config.initialCash}`, `$${other.snapshot.config.initialCash}`],
          ['Fee per trade', `${active.snapshot.config.feeBps} bps`, `${other.snapshot.config.feeBps} bps`],
          ['Slippage per trade', `${active.snapshot.config.slippageBps} bps`, `${other.snapshot.config.slippageBps} bps`],
          ['Full evaluation', `${active.start} → ${active.end}`, `${other.start} → ${other.end}`],
          ['Later-period start', active.snapshot.config.holdoutStart, other.snapshot.config.holdoutStart],
          ['Selected observations', `${comparison.left.start} → ${comparison.left.end} · ${comparison.left.observations}`, `${comparison.right.start} → ${comparison.right.end} · ${comparison.right.observations}`],
          ...(['asset', 'benchmark'] as const).flatMap(role => {
            const a = active.snapshot[role], b = other.snapshot[role], name = role === 'asset' ? 'Asset' : 'Benchmark';
            return [[`${name} prices`, `${a.dataset.symbol} · ${a.dataset.source} · ${a.dataset.id}`, `${b.dataset.symbol} · ${b.dataset.source} · ${b.dataset.id}`], [`${name} events`, `${a.actions.source} · revision ${a.actions.revision}`, `${b.actions.source} · revision ${b.actions.revision}`]];
          }),
        ]).map(([label, left, right]) => <TableRow key={label}><TableCell>{label}</TableCell><TableCell>{left}</TableCell><TableCell>{right}</TableCell></TableRow>)}
      </TableBody></Table></details>
    </>}
  </section>;
}
