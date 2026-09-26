'use client';
import ReportDownload from './report-download';
import ConfidenceCertificate from './confidence-certificate';
import { actionsCertificate } from '@/lib/finance/confidence';
import { useEffect, useState } from 'react';
import { GitBranch, Plus, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { actionPerformance, validateActions, MAX_ACTIONS, type ActionInput, type ActionDraft, type SavedActions } from '@/lib/finance/corporate-actions';
import type { SavedDataset } from '@/lib/finance/market-data';
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const dollars = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
const blank = (): ActionInput => ({ source: '', complete: false, events: [] });
type Performance = ReturnType<typeof actionPerformance>;
async function read(response: Response): Promise<{ actions: SavedActions | null }> { const data = await response.json() as { error?: string; actions: SavedActions | null }; if (!response.ok) throw new Error(data.error || 'Could not load the event record.'); return data; }
function Comparison({ analysis }: { analysis: Performance }) {
  const history = analysis.history, [hover, setHover] = useState<number | null>(null);
  const series = [{ key: 'rawIndex', label: 'Raw price', color: '#9b7851' }, { key: 'splitIndex', label: 'After splits', color: '#5978b3' }, { key: 'wealthIndex', label: 'Including dividends', color: '#20775b' }] as const;
  const values = history.flatMap(p => series.map(s => p[s.key])), low = Math.min(...values), high = Math.max(...values), pad = Math.max((high - low) * .12, 1);
  const start = Date.parse(history[0].date), end = Date.parse(history.at(-1)!.date);
  const x = (i: number) => 65 + (Date.parse(history[i].date) - start) / (end - start) * 760;
  const y = (v: number) => 15 + (high + pad - v) / (high - low + 2 * pad) * 215;
  const index = hover ?? history.length - 1;
  return <div className="actions-comparison"><div className="actions-legend"><span>{history[index].date}</span>{series.map(s => <span key={s.key}><i style={{ background: s.color }}/>{s.label} <strong>{history[index][s.key].toFixed(2)}</strong></span>)}</div>
    <svg viewBox="0 0 850 270" role="img" aria-label="Comparison of raw price, split-aware holding value, and value including dividend receivables. Each starts at 100. Full values are in the analysis export."
      onPointerMove={e => { const bounds = e.currentTarget.getBoundingClientRect(), target = (e.clientX - bounds.left) / bounds.width * 850; let nearest = 0; for (let i = 1; i < history.length; i++) if (Math.abs(x(i) - target) < Math.abs(x(nearest) - target)) nearest = i; setHover(nearest); }} onPointerLeave={() => setHover(null)}>
      {[0, .5, 1].map(f => { const value = low + (high - low) * f; return <g key={f}><line x1="65" x2="825" y1={y(value)} y2={y(value)} stroke="#e3e9e5" strokeDasharray="3 5"/><text x="53" y={y(value) + 4} textAnchor="end" fill="#607367" fontSize="12">{value.toFixed(1)}</text></g>; })}
      {series.map(s => <path key={s.key} d={history.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[s.key])}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.key === 'rawIndex' ? '6 4' : undefined}/>)}
      {hover !== null && <line x1={x(index)} x2={x(index)} y1="10" y2="235" stroke="#8ba391" strokeDasharray="3 4"/>}
      <text x="65" y="260" fill="#607367" fontSize="12">{history[0].date}</text><text x="825" y="260" textAnchor="end" fill="#607367" fontSize="12">{history.at(-1)!.date}</text>
    </svg></div>;
}
export default function CorporateActions({ dataset }: { dataset: SavedDataset }) {
  const [saved, setSaved] = useState<SavedActions | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<ActionInput>(blank), [preview, setPreview] = useState<Performance | null>(null), [formError, setFormError] = useState(''), [saving, setSaving] = useState(false);
  const eligible = dataset.basis === 'raw' && dataset.priceColumn === 'close';
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    void fetch(`/api/actions?id=${dataset.id}`, { cache: 'no-store', signal: controller.signal }).then(read).then(result => setSaved(result.actions)).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [dataset.id, eligible, refresh]);
  function reload() { setLoading(true); setError(''); setRefresh(v => v + 1); }
  function edit(next: ActionInput) { setDraft(next); setPreview(null); setFormError(''); }
  function changeEvent(index: number, patch: Partial<ActionDraft>) { edit({ ...draft, events: draft.events.map((e, i) => i === index ? { ...e, ...patch } : e) }); }
  function start() { setDraft(saved ? { source: saved.source, complete: false, events: saved.events.map(e => ({ ...e })) } : blank()); setPreview(null); setFormError(''); setOpen(true); }
  async function save() {
    if (!preview) return; setSaving(true); setFormError('');
    try { const result = await fetch('/api/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datasetId: dataset.id, revision: saved?.revision ?? 0, actions: draft }) }).then(read); setSaved(result.actions); setOpen(false); toast.success('Event record saved. Performance comparison updated.'); }
    catch (e) { setFormError((e as Error).message); } finally { setSaving(false); }
  }
  const analysis = saved ? actionPerformance(dataset, { source: saved.source, complete: true, events: saved.events }) : null;
  return <section className="panel actions-panel">
    <div className="panel-heading"><div><h2><GitBranch size={18}/> Splits & dividends</h2><p>Trace the effect of corporate actions on a buy-and-hold position.</p></div>{eligible && !loading && !error && <Button variant={saved ? 'outline' : 'default'} onClick={start}>{saved ? 'Edit event record' : 'Add event record'}</Button>}</div>
    {!eligible ? <p className="actions-message">This dataset uses adjusted or unknown prices. Use an unadjusted close dataset to apply events without double counting. The original series change remains available above.</p> : <>
      {loading && <p className="actions-message" role="status">Loading event record…</p>}
      {error && <p className="actions-message negative" role="alert">{error} <button className="text-link" onClick={reload}>Retry</button></p>}
      {!loading && !error && !saved && <div className="actions-empty"><p>No event coverage recorded for {dataset.symbol}.</p><p>Add split effective dates and cash-dividend ex-dates from your source, or explicitly record that there were no events. Price history alone cannot establish that.</p></div>}
      {saved && analysis && <>
        <ConfidenceCertificate certificate={actionsCertificate(dataset,saved,analysis,dataset.id)}/>
        <div className="actions-meta"><span className="research-kind">USER-SUPPLIED EVENTS</span><span>Revision {saved.revision} · {saved.events.length} events · {dataset.kind === 'synthetic' ? 'Fictional data' : 'Historical research'}</span><Button variant="outline" size="sm" asChild><ReportDownload href={`/api/actions?id=${dataset.id}&download=1`} download><Download size={15}/> Export analysis</ReportDownload></Button></div>
        <div className="actions-metrics"><div><span>Raw price change</span><strong>{pct(analysis.priceReturnPct)}</strong></div><div><span>After splits</span><strong>{pct(analysis.splitReturnPct)}</strong></div><div><span>Including cash dividends</span><strong className={analysis.cashInclusiveReturnPct >= 0 ? 'positive' : 'negative'}>{pct(analysis.cashInclusiveReturnPct)}</strong></div><div><span>Observed wealth decline</span><strong>{pct(analysis.drawdownPct)}</strong></div></div>
        <Comparison analysis={analysis}/>
        <div className="actions-details"><p><strong>Source:</strong> {saved.source}</p><p>Starting with 1 share at the first close → {analysis.shares} shares, plus {dollars(analysis.incomePerInitialShare)} in cash dividends earned. Original acquisition cost stays fixed through splits.</p><p>All chart series start at 100. Dividends accrue as receivables on ex-date and are held without interest or reinvestment. This is a hypothetical position, not payment-date cash in your portfolio.</p></div>
        {saved.events.length ? <Table><TableHeader><TableRow><TableHead>Effective / ex-date</TableHead><TableHead>Event</TableHead><TableHead>Terms</TableHead></TableRow></TableHeader><TableBody>{saved.events.map(e => <TableRow key={`${e.date}-${e.type}`}><TableCell>{e.date}</TableCell><TableCell>{e.type === 'split' ? 'Stock split' : 'Cash dividend'}</TableCell><TableCell>{e.type === 'split' ? `${e.newShares} new for ${e.oldShares} old` : `$${e.amount} / post-split share`}</TableCell></TableRow>)}</TableBody></Table> : <p className="actions-message">You declared no split or cash-dividend events in this period.</p>}
        <div className="research-chart-note">Coverage after {dataset.firstDate} through {dataset.lastDate} is declared by you and has not been independently verified. Splits apply before same-date dividends. Fractional shares are retained; taxes, fees, cash in lieu, spin-offs and other distributions are excluded. Only supplied observation dates are valued.</div>
      </>}
    </>}
    <Dialog open={open} onOpenChange={value => { if (!saving) { setOpen(value); if (!value) reload(); } }}><DialogContent className="import-dialog actions-dialog"><DialogHeader><DialogTitle>{dataset.symbol} · Split & dividend record</DialogTitle><DialogDescription>Use dates after {dataset.firstDate} through {dataset.lastDate}. The holding starts at the first supplied close.</DialogDescription></DialogHeader>
      <form className="import-form" onSubmit={e => { e.preventDefault(); setFormError(''); try { const validated = validateActions(draft, dataset); setPreview(actionPerformance(dataset, validated)); } catch (err) { setPreview(null); setFormError((err as Error).message); } }}>
        <fieldset className="import-fields" disabled={saving}><label>Event source<Input value={draft.source} onChange={e => edit({ ...draft, source: e.target.value })} placeholder="Company announcement or event-data source" minLength={3} maxLength={160} required/></label>
          <p className="form-note">Enter new shares for old shares (2 for 1 means a forward split). Cash dividends use ex-date and USD per post-split share. Confirm these terms in your source; dates and amounts are not fetched automatically.</p>
          <div className="action-edit-list">{draft.events.map((event, i) => <div className="action-edit-row" key={i}>
            <div className="action-edit-heading"><strong>Event {i + 1}</strong><Button type="button" variant="ghost" size="sm" aria-label={`Remove event ${i + 1}`} onClick={() => edit({ ...draft, events: draft.events.filter((_, index) => i !== index) })}><Trash2 size={16}/> Remove</Button></div>
            <div className="form-grid"><label>Event type<NativeSelect value={event.type} onChange={e => changeEvent(i, { type: e.target.value as ActionDraft['type'], newShares: e.target.value === 'split' ? '2' : '', oldShares: e.target.value === 'split' ? '1' : '', amount: '' })}><option value="split">Stock split</option><option value="dividend">Cash dividend</option></NativeSelect></label><label>{event.type === 'split' ? 'Effective date' : 'Ex-dividend date'}<Input type="date" value={event.date} max={dataset.lastDate} required onInput={e => changeEvent(i, { date: e.currentTarget.value })}/></label></div>
            {event.type === 'split' ? <div className="form-grid"><label>New shares<Input inputMode="numeric" value={event.newShares} maxLength={6} required onChange={e => changeEvent(i, { newShares: e.target.value })}/></label><label>For old shares<Input inputMode="numeric" value={event.oldShares} maxLength={6} required onChange={e => changeEvent(i, { oldShares: e.target.value })}/></label></div> : <label>USD per post-split share<Input inputMode="decimal" value={event.amount} maxLength={14} required placeholder="0.25" onChange={e => changeEvent(i, { amount: e.target.value })}/></label>}
          </div>)}</div>
          <Button type="button" variant="outline" disabled={draft.events.length >= MAX_ACTIONS} onClick={() => edit({ ...draft, events: [...draft.events, { date: '', type: 'split', newShares: '2', oldShares: '1', amount: '' }] })}><Plus size={16}/> Add event</Button>
          <label className="actions-confirm"><Checkbox checked={draft.complete} onCheckedChange={checked => edit({ ...draft, complete: checked === true })}/><span>I checked this whole period. This list includes every split and cash dividend (or none), and there are no spin-offs or other unsupported distributions.</span></label>
          <p className="form-note">Preview assumes dividends accrue on ex-date without reinvestment, and retains fractional shares after reverse splits. Saving replaces this dataset’s event record; the price snapshot stays unchanged.</p>
        </fieldset>
        {formError && <p className="negative import-error" role="alert">{formError}</p>}
        {preview && <div className="import-preview"><strong>Preview · not saved yet</strong><p>{preview.eventCount} events · Raw price {pct(preview.priceReturnPct)} → After splits {pct(preview.splitReturnPct)} → Including cash dividends {pct(preview.cashInclusiveReturnPct)}</p><p>Ending shares: {preview.shares} · Dividends earned: {dollars(preview.incomePerInitialShare)}</p></div>}
        <div className="import-actions"><Button variant={preview ? 'outline' : 'default'} type="submit" disabled={saving}>Validate & preview events</Button>{preview && <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save event record'}</Button>}</div>
      </form>
    </DialogContent></Dialog>
  </section>;
}
