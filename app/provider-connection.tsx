'use client';
import { useCallback, useEffect, useState } from 'react';
import { CloudDownload, KeyRound, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { providerSymbols, type ProviderMode, type ProviderStatus } from '@/lib/finance/provider';

export default function ProviderConnection({ onImported, requestedSymbol, onViewDataset = onImported }: { onImported: (id: string) => void; requestedSymbol?: string; onViewDataset?: (id: string) => void }) {
  const [status, setStatus] = useState<ProviderStatus | null>(null), [loadError, setLoadError] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false), [symbol, setSymbol] = useState('AAPL'), [key, setKey] = useState(''), [mode, setMode] = useState<ProviderMode>('key');
  const [now, setNow] = useState(() => Date.now());
  const lastRequest = status?.runs[0]?.started;
  const cooldown = lastRequest ? Math.max(0, Math.ceil((Date.parse(lastRequest) + 60000 - now) / 1000)) : 0;
  useEffect(() => {
    if (!lastRequest) return;
    const deadline = Date.parse(lastRequest) + 60000;
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => { const current = Date.now(); setNow(current); if (current >= deadline) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [lastRequest]);
  const reload = useCallback(async () => {
    try { const response = await fetch('/api/provider', { cache: 'no-store' }); const body = await response.json() as ProviderStatus & { error?: string }; if (!response.ok) throw new Error(body.error || 'Connection status is unavailable.'); setStatus(body); setNow(Date.now()); setLoadError(''); }
    catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/provider', { cache: 'no-store', signal: controller.signal }).then(async response => { const body = await response.json() as ProviderStatus & { error?: string }; if (!response.ok) throw new Error(body.error || 'Connection status is unavailable.'); return body; }).then(body => { if (!controller.signal.aborted) { setStatus(body); setNow(Date.now()); setLoadError(''); } }).catch(e => { if (!controller.signal.aborted) setLoadError((e as Error).message); });
    return () => controller.abort();
  }, []);
  async function run(connection: ProviderMode, requestedSymbol: string) {
    setBusy(true); setError('');
    const request = connection === 'key' ? { symbol: requestedSymbol, mode: connection, apiKey: key } : { symbol: requestedSymbol, mode: connection };
    // Credentials are request-only: clear the field immediately and never persist them.
    setKey('');
    try {
      const response = await fetch('/api/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const body = await response.json() as { error?: string; message: string; dataset: { id: string }; historyWarning?: string };
      if (!response.ok) throw new Error(body.error || 'Could not fetch daily prices.');
      setOpen(false); onImported(body.dataset.id); toast.success(body.message); if (body.historyWarning) toast.warning(body.historyWarning);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); await reload(); }
  }
  return <section className="panel provider-panel">
    <div className="provider-heading"><span className="provider-icon"><CloudDownload size={24}/></span><div><h2>Alpha Vantage daily prices</h2><p>Fetch up to 100 recent daily observations directly from the provider.</p></div><span className="provider-tag">ON-DEMAND</span></div>
    <div className="provider-actions"><Button onClick={() => void run('demo', 'IBM')} disabled={busy || cooldown > 0}>{busy ? <RefreshCw size={16} className="animate-spin"/> : <CloudDownload size={16}/>} {busy ? 'Fetching prices…' : cooldown > 0 ? `App cooldown · ${cooldown}s` : 'Fetch IBM · public access'}</Button><Button variant="outline" disabled={busy || cooldown > 0} onClick={() => { setSymbol(requestedSymbol ?? 'AAPL'); setMode(status?.configured ? 'configured' : 'key'); setError(''); setKey(''); setOpen(true); }}><KeyRound size={16}/>{requestedSymbol ? `Fetch ${requestedSymbol} with a key` : status?.configured ? 'Fetch another symbol' : 'Use your API key'}</Button><a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer">Get a provider key <ArrowRight size={14}/></a></div>
    <p className="provider-note">IBM uses the provider’s public demo key to fetch provider-supplied prices, separate from MarketLab’s fictional demo portfolio. Other supported symbols require your key. Prices are unadjusted daily history, not streaming quotes. Saved data can be reopened without another provider request.</p>
    {error && !open && <p className="provider-error negative" role="alert">{error}</p>}
    {loadError && <p className="provider-error negative" role="alert">{loadError} <button onClick={() => void reload()}>Retry status</button></p>}
    {status && status.runs.length > 0 && <div className="provider-runs"><h3>Recent provider requests</h3>{status.runs.slice(0, 5).map(r => {
      const unfinished = r.status === 'running' && now - Date.parse(r.started) > 60000;
      return <div key={r.id} className="provider-run"><div><strong>{r.symbol}</strong><span>{r.started.replace('T', ' ').slice(0, 19)} UTC · {r.mode === 'demo' ? 'Provider demo' : 'API key'}</span></div><span className={r.status === 'completed' ? 'positive' : r.status === 'failed' ? 'negative' : ''}>{unfinished ? 'Unfinished' : r.status} {r.status === 'completed' && `· ${r.records} rows`}</span>{r.dataset_id ? <button className="text-link" onClick={() => onViewDataset(r.dataset_id!)}>View dataset <ArrowRight size={14}/></button> : <p>{unfinished ? 'No completion recorded. Check saved datasets before retrying.' : r.message}</p>}</div>;
    })}</div>}
    <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); if (!value) setKey(''); } }}><DialogContent><DialogHeader><DialogTitle>Fetch daily price history</DialogTitle><DialogDescription>Supported US-listed USD securities. Each successful request saves a traceable dataset.</DialogDescription></DialogHeader><form className="import-form" onSubmit={e => { e.preventDefault(); void run(mode, symbol); }}>
      <label>Symbol<NativeSelect value={symbol} disabled={busy} onChange={e => setSymbol(e.target.value)}>{providerSymbols.map(s => <option key={s} value={s}>{s}</option>)}</NativeSelect></label>
      {status?.configured && <label>Connection<NativeSelect value={mode} disabled={busy} onChange={e => { setMode(e.target.value as ProviderMode); setKey(''); }}><option value="configured">Configured server key</option><option value="key">One-time API key</option></NativeSelect></label>}
      {mode === 'key' && <label>Alpha Vantage API key<Input type="password" name="provider-key" value={key} autoComplete="off" spellCheck={false} minLength={8} maxLength={128} required disabled={busy} onChange={e => setKey(e.target.value)}/></label>}
      <p className="form-note">A one-time key is sent to Alpha Vantage through MarketLab for this request. MarketLab does not save your key to datasets, browser storage or application logs. The field clears after submission.</p><p className="form-note">MarketLab waits one minute between attempts, including failed requests. This app cooldown is separate from Alpha Vantage’s limits and does not predict when its allowance resets. No requests are retried automatically.</p>
      {error && <><p role="alert" className="negative import-error">{error}</p>{mode === 'key' && <p className="form-note">Your key field was cleared after the attempt. Re-enter it before retrying.</p>}</>}<Button type="submit" disabled={busy || cooldown > 0}>{busy ? 'Fetching prices…' : cooldown > 0 ? `App cooldown · ${cooldown}s` : 'Fetch & save daily prices'}</Button>
    </form></DialogContent></Dialog>
  </section>;
}
