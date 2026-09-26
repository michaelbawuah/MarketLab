'use client';
import { useEffect, useState } from 'react';
import { Upload, Download, FileSpreadsheet, ShieldCheck, ArrowRight, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import ProviderConnection from './provider-connection';
import CorporateActions from './corporate-actions';
import ResearchChart from './research-chart';
import { basisLabels, validateImport, exampleDraft, priceDecimal, seriesStats, MAX_CSV_BYTES, type ImportDraft, type DatasetInput, type DatasetSummary, type SavedDataset } from '@/lib/finance/market-data';

const blankDraft: ImportDraft = { symbol: '', source: '', basis: 'unknown', priceColumn: 'close', kind: 'historical', csv: '' };
const pct = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2) + '%';
const price = (s: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(s) / 1e6);
async function readJSON<T>(response: Response): Promise<T> {
  const value = await response.json() as { error?: string }; if (!response.ok) throw new Error(value.error || 'Could not load market data.'); return value as T;
}


export default function MarketData({ initialDatasetId = '' }: { initialDatasetId?: string }) {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]), [selected, setSelected] = useState(initialDatasetId), [dataset, setDataset] = useState<SavedDataset | null>(null);
  const [loading, setLoading] = useState(true), [detailLoading, setDetailLoading] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState<ImportDraft>(blankDraft), [preview, setPreview] = useState<DatasetInput | null>(null), [formError, setFormError] = useState(''), [saving, setSaving] = useState(false), [fileLoading, setFileLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/datasets', { cache: 'no-store', signal: controller.signal }).then(readJSON<{ datasets: DatasetSummary[] }>).then(result => {
      setDatasets(result.datasets); setSelected(current => result.datasets.some(d => d.id === current) ? current : result.datasets[0]?.id ?? '');
    }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`/api/datasets?id=${selected}`, { cache: 'no-store', signal: controller.signal }).then(readJSON<SavedDataset>).then(value => { if (!controller.signal.aborted) setDataset(value); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected, refresh]);
  function selectDataset(id: string) { setSelected(id); setDataset(null); setDetailLoading(true); setError(''); }
  function reloadDatasets() { setLoading(true); setDetailLoading(true); setError(''); setRefresh(v => v + 1); }
  function edit<K extends keyof ImportDraft>(key: K, value: ImportDraft[K]) { setDraft(d => ({ ...d, [key]: value })); setPreview(null); setFormError(''); }
  function start(sample = false) { setDraft(sample ? { ...exampleDraft } : { ...blankDraft }); setPreview(null); setFormError(''); setOpen(true); }
  async function importFile(file?: File) {
    if (!file) return;
    setPreview(null); setFormError('');
    if (file.size > MAX_CSV_BYTES) { setFormError('CSV must be 256 KiB or smaller.'); return; }
    setFileLoading(true);
    try { const text = await file.text(); setDraft(d => ({ ...d, csv: text })); } catch { setFormError('Could not read that file. Try selecting it again.'); }
    finally { setFileLoading(false); }
  }
  async function save() {
    if (!preview) return; setSaving(true); setFormError('');
    try {
      const result = await fetch('/api/datasets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }).then(readJSON<{ dataset: DatasetSummary; message: string }>);
      selectDataset(result.dataset.id); reloadDatasets(); setOpen(false); toast.success(result.message);
    } catch (e) { setFormError((e as Error).message); } finally { setSaving(false); }
  }
  const stats = dataset ? seriesStats(dataset.observations) : null;
  return <div className="research-workspace">
    <ProviderConnection onImported={id => { selectDataset(id); reloadDatasets(); }}/>
    <div className="research-toolbar"><div><span className="research-status"><FileSpreadsheet size={16}/> CSV imports ready</span><p>Bring your own daily price history. Each saved import keeps its source and adjustment details.</p></div><Button onClick={() => start()}><Upload size={16}/> Import CSV</Button></div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={reloadDatasets}>Retry</button></div>}
    {loading && !datasets.length ? <div className="panel empty-state" role="status">Loading saved datasets…</div> : !datasets.length && !error ? <section className="panel research-empty"><FileSpreadsheet size={36}/><h2>Your research starts with the data.</h2><p>Fetch a provider dataset above, or import up to 2,500 observations for one USD symbol from a CSV.</p><div><Button onClick={() => start()}><Upload size={16}/> Import your first CSV</Button><Button variant="outline" onClick={() => start(true)}>Try a fictional example <ArrowRight size={16}/></Button></div><code>date,close<br/>2026-09-14,100.125<br/>2026-09-15,101.250</code><p className="research-muted">Historical datasets stay separate from the synthetic paper portfolio.</p></section> : datasets.length > 0 && <>
      <div className="dataset-picker"><label htmlFor="dataset-select">Saved dataset</label><NativeSelect id="dataset-select" value={selected} onChange={e => selectDataset(e.target.value)}>{datasets.map(d => <option key={d.id} value={d.id}>{d.symbol} · {d.firstDate} → {d.lastDate} · {d.origin === 'alphavantage' ? 'Provider' : d.kind === 'synthetic' ? 'Synthetic' : 'Uploaded'} · {d.id.slice(0, 8)}</option>)}</NativeSelect><span>{datasets.length} / 30 saved</span></div>
      {!error && (detailLoading || (selected && dataset?.id !== selected)) && <div className="panel empty-state" role="status"><RefreshCw size={20} className="animate-spin"/>Loading observations…</div>}
      {dataset && dataset.id === selected && stats && <>
        <div className="research-stats"><div><span>Last supplied price</span><strong>{price(dataset.observations.at(-1)!.priceMicros)}</strong><small>As of {dataset.lastDate}</small></div><div><span>Series change</span><strong className={stats.changePct >= 0 ? 'positive' : 'negative'}>{pct(stats.changePct)}</strong><small>First to last supplied price</small></div><div><span>Largest observed decline</span><strong>{pct(stats.drawdownPct)}</strong><small>From a prior observed peak</small></div><div><span>Observations</span><strong>{dataset.count.toLocaleString()}</strong><small>Longest interval: {stats.longestGapDays} calendar days</small></div></div>
        <section className="panel research-performance"><div className="panel-heading"><div><h2>{dataset.symbol} · Price history</h2><p>{dataset.firstDate} – {dataset.lastDate}</p></div><Button variant="outline" asChild><a href={`/api/datasets?id=${dataset.id}&download=1`} download><Download size={16}/> Export dataset</a></Button></div><ResearchChart key={dataset.id} dataset={dataset}/><div className="research-chart-note">Only supplied observations are plotted; lines connect them without filling gaps. Series change and decline use the declared price basis, with no extra dividends, fees or cash flows.</div></section>
        <CorporateActions key={dataset.id} dataset={dataset}/><section className="panel research-provenance"><div className="panel-heading"><h2><ShieldCheck size={18}/> Dataset provenance</h2><span className="research-kind">{dataset.origin === 'alphavantage' ? 'PROVIDER API' : dataset.kind === 'synthetic' ? 'SYNTHETIC' : 'USER-SUPPLIED'}</span></div><dl><div><dt>{dataset.origin === 'alphavantage' ? 'Provider source' : 'Declared source'}</dt><dd>{dataset.source}</dd></div><div><dt>Adjustment basis</dt><dd>{basisLabels[dataset.basis]}</dd></div><div><dt>Imported column</dt><dd>{dataset.priceColumn}</dd></div><div><dt>Saved (UTC)</dt><dd>{dataset.created.replace('T', ' ').slice(0, 19)}</dd></div>{dataset.origin === 'alphavantage' && <><div><dt>Provider refreshed</dt><dd>{dataset.providerRefreshed}</dd></div><div><dt>Provider timezone</dt><dd>{dataset.providerTimezone}</dd></div></>}<div className="dataset-hash"><dt>Content fingerprint · SHA-256</dt><dd>{dataset.id}</dd></div></dl><p>{dataset.origin === 'alphavantage' ? 'Fetched directly from Alpha Vantage. Unadjusted prices can reflect stock splits and exclude dividend returns. USD is determined from the supported US symbol universe.' : dataset.kind === 'synthetic' ? 'These are fictional observations, not actual market prices.' : 'Source, symbol, USD currency and adjustment basis are supplied by the uploader; MarketLab has not independently verified them.'} No exchange-calendar completeness or live freshness is implied.</p></section>
        <section className="panel research-observations"><div className="panel-heading"><h2>Latest observations</h2><span className="subtle">Last {Math.min(10, dataset.count)} of {dataset.count} · full history in export</span></div><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Symbol</TableHead><TableHead className="numeric">Price (USD)</TableHead></TableRow></TableHeader><TableBody>{dataset.observations.slice(-10).reverse().map(p => <TableRow key={p.date}><TableCell>{p.date}</TableCell><TableCell>{dataset.symbol}</TableCell><TableCell className="numeric">{priceDecimal(p.priceMicros)}</TableCell></TableRow>)}</TableBody></Table></section>
      </>}
    </>}
    <Dialog open={open} onOpenChange={value => { if (!saving && !fileLoading) setOpen(value); }}><DialogContent className="import-dialog"><DialogHeader><DialogTitle>Import daily prices</DialogTitle><DialogDescription>One USD symbol per file. Validate and preview before saving an immutable snapshot.</DialogDescription></DialogHeader>
      <form className="import-form" onSubmit={e => { e.preventDefault(); setFormError(''); try { setPreview(validateImport(draft)); } catch (err) { setPreview(null); setFormError((err as Error).message); } }}>
        <fieldset disabled={saving || fileLoading} className="import-fields"><div className="form-grid"><label>Symbol<Input value={draft.symbol} onChange={e => edit('symbol', e.target.value)} placeholder="AAPL" maxLength={15} required/></label><label>Data type<NativeSelect value={draft.kind} onChange={e => edit('kind', e.target.value as ImportDraft['kind'])}><option value="historical">Historical · supplied by you</option><option value="synthetic">Synthetic / fictional</option></NativeSelect></label></div>
        <label>Source name<Input value={draft.source} onChange={e => edit('source', e.target.value)} placeholder="Provider or export source" minLength={3} maxLength={160} required/></label>
        <div className="form-grid"><label>CSV price column<NativeSelect value={draft.priceColumn} onChange={e => edit('priceColumn', e.target.value as ImportDraft['priceColumn'])}><option value="close">Close</option><option value="adjusted_close">Adjusted close</option></NativeSelect></label><label>Price adjustments<NativeSelect value={draft.basis} onChange={e => edit('basis', e.target.value as ImportDraft['basis'])}>{Object.entries(basisLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></label></div>
        <p className="form-note">Choose Unknown unless the source documents its adjustments. Currency must be USD. Prices are preserved to six decimal places.</p>
        <label>Choose a CSV file<Input type="file" accept=".csv,text/csv" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }}/></label>
        <label>Or paste CSV<Textarea aria-label="CSV content" value={draft.csv} onChange={e => edit('csv', e.target.value)} placeholder={'date,close\n2026-09-14,100.125\n2026-09-15,101.250'} rows={6} required maxLength={MAX_CSV_BYTES}/></label>
        <p className="form-note">Headers: date (or timestamp), close. For adjusted prices: adjusted_close (or Adj Close). Optional symbol must match. Maximum 256 KiB and 2,500 observations.</p></fieldset>
        {formError && <p className="negative import-error" role="alert">{formError}</p>}
        {preview && <div className="import-preview"><strong><Check size={17}/> Validation passed · not saved yet</strong><p>{preview.symbol} · {preview.observations.length} observations · {preview.observations[0].date} → {preview.observations.at(-1)!.date}</p><p>First: {price(preview.observations[0].priceMicros)} · Last: {price(preview.observations.at(-1)!.priceMicros)}</p><p>{basisLabels[preview.basis]} · {preview.kind === 'synthetic' ? 'Fictional data' : 'User-supplied history'}</p><small>Every row passed date, price, precision and duplicate checks. Calendar coverage and source authenticity are not verified.</small></div>}
        <div className="import-actions"><Button type="submit" variant={preview ? 'outline' : 'default'} disabled={saving || fileLoading}>{fileLoading ? 'Reading file…' : 'Validate & preview'}</Button>{preview && <Button type="button" onClick={() => void save()} disabled={saving || fileLoading}>{saving ? 'Saving…' : 'Save dataset'}</Button>}</div>
      </form>
    </DialogContent></Dialog>
  </div>;
}
