'use client';
import { useCallback, useEffect, useState } from 'react';
import { CloudDownload, KeyRound, RefreshCw, ArrowRight, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { providerSymbols, type ProviderMode, type ProviderStatus, type ProviderDiagnostic } from '@/lib/finance/provider';
import { fetchAndSaveBrowserPrices, BrowserProviderError, type ProviderSaveResult } from '@/lib/finance/browser-provider';

type DiagnosticDetails = ProviderDiagnostic & { symbol: string; code: string; requestId?: string };
function ProviderErrorDetails({ details }: { details: DiagnosticDetails | null }) {
  if (!details) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify({ provider: 'Alpha Vantage', endpoint: 'TIME_SERIES_DAILY', ...details }, null, 2)); toast.success('Diagnostic copied. Your submitted key is removed.'); }
    catch { toast.error('Could not copy. You can screenshot the provider response below.'); }
  }
  return <div className="rounded-lg border p-4 space-y-3 text-sm" aria-label="Provider response details">
    <strong>Provider response · {details.symbol}</strong>
    <blockquote className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">{details.providerNotice ?? 'The provider returned no readable explanation in its response.'}</blockquote>
    <p className="text-muted-foreground">Upstream HTTP {details.upstreamStatus} · {details.code}{details.noticeFields.length > 0 && ` · ${details.noticeFields.join(', ')}`}</p>
    <p className="text-muted-foreground">Your submitted key and links are removed. These details are not saved to request history.</p>
    <Button type="button" variant="outline" onClick={() => void copy()}><Copy size={15}/> Copy diagnostic</Button>
  </div>;
}

export default function ProviderConnection({ onImported, requestedSymbol, onViewDataset = onImported }: { onImported: (id: string) => void; requestedSymbol?: string; onViewDataset?: (id: string) => void }) {
  const [status, setStatus] = useState<ProviderStatus | null>(null), [loadError, setLoadError] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false), [symbol, setSymbol] = useState('AAPL'), [key, setKey] = useState(''), [mode, setMode] = useState<ProviderMode>('key');
  const [details, setDetails] = useState<DiagnosticDetails | null>(null);
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
    setBusy(true); setError(''); setDetails(null);
    const request = connection === 'key' ? { symbol: requestedSymbol, mode: connection, apiKey: key } : { symbol: requestedSymbol, mode: connection };
    // Credentials are request-only: clear the field immediately and never persist them.
    setKey('');
    try {
      let body: ProviderSaveResult;
      if (connection === 'key') body = await fetchAndSaveBrowserPrices(requestedSymbol, request.apiKey!);
      else {
        const response = await fetch('/api/provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        const result = await response.json() as ProviderSaveResult & { error?: string; code?: string; diagnostic?: ProviderDiagnostic; requestId?: string };
        if (!response.ok) { if (result.diagnostic) setDetails({ ...result.diagnostic, symbol: requestedSymbol, code: result.code ?? 'provider_error', requestId: result.requestId }); throw new Error(result.error || 'Could not fetch daily prices.'); }
        body = result;
      }
      setOpen(false); onImported(body.dataset.id); toast.success(body.message); if (body.historyWarning) toast.warning(body.historyWarning);
    } catch (e) {
      if (e instanceof BrowserProviderError && e.diagnostic) setDetails({ ...e.diagnostic, symbol: requestedSymbol, code: e.code, requestId: e.requestId });
      setError((e as Error).message);
    } finally { await reload(); setBusy(false); }
  }
  return <section className="panel provider-panel">
    <div className="provider-heading"><span className="provider-icon"><CloudDownload size={24}/></span><div><h2>Alpha Vantage daily prices</h2><p>Fetch up to 100 recent daily observations directly from the provider.</p></div><span className="provider-tag">ON-DEMAND</span></div>
    <div className="provider-actions"><Button onClick={() => void run('demo', 'IBM')} disabled={busy || cooldown > 0}>{busy ? <RefreshCw size={16} className="animate-spin"/> : <CloudDownload size={16}/>} {busy ? 'Fetching prices…' : cooldown > 0 ? `App cooldown · ${cooldown}s` : 'Fetch IBM · public access'}</Button><Button variant="outline" disabled={busy || cooldown > 0} onClick={() => { setSymbol(requestedSymbol ?? 'AAPL'); setMode(status?.configured ? 'configured' : 'key'); setError(''); setDetails(null); setKey(''); setOpen(true); }}><KeyRound size={16}/>{requestedSymbol ? `Fetch ${requestedSymbol} with a key` : status?.configured ? 'Fetch another symbol' : 'Use your API key'}</Button><a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer">Get a provider key <ArrowRight size={14}/></a></div>
    <p className="provider-note">IBM uses the provider’s public demo key to fetch provider-supplied prices, separate from MarketLab’s fictional demo portfolio. Other supported symbols require your key. Prices are unadjusted daily history, not streaming quotes. Saved data can be reopened without another provider request.</p>
    {error && !open && <><p className="provider-error negative" role="alert">{error}</p><ProviderErrorDetails details={details}/></>}
    {loadError && <p className="provider-error negative" role="alert">{loadError} <button onClick={() => void reload()}>Retry status</button></p>}
    {status && status.runs.length > 0 && <div className="provider-runs"><h3>Recent provider requests</h3>{status.runs.slice(0, 5).map(r => {
      const unfinished = ['running', 'saving'].includes(r.status) && now - Date.parse(r.started) > 60000;
      return <div key={r.id} className="provider-run"><div><strong>{r.symbol}</strong><span>{r.started.replace('T', ' ').slice(0, 19)} UTC · {r.mode === 'demo' ? 'Provider demo' : r.mode === 'browser' ? 'Direct browser connection' : 'Server connection'}</span></div><span className={r.status === 'completed' ? 'positive' : r.status === 'failed' ? 'negative' : ''}>{unfinished ? 'Unfinished' : r.status} {r.status === 'completed' && `· ${r.records} rows`}</span>{r.dataset_id ? <button className="text-link" onClick={() => onViewDataset(r.dataset_id!)}>View dataset <ArrowRight size={14}/></button> : <p>{unfinished ? 'No completion recorded. Check saved datasets before retrying.' : r.message}</p>}</div>;
    })}</div>}
    <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); if (!value) setKey(''); } }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Fetch daily price history</DialogTitle><DialogDescription>Supported US-listed USD securities. Each successful request saves a traceable dataset.</DialogDescription></DialogHeader><form className="import-form" onSubmit={e => { e.preventDefault(); void run(mode, symbol); }}>
      <label>Symbol<NativeSelect value={symbol} disabled={busy} onChange={e => setSymbol(e.target.value)}>{providerSymbols.map(s => <option key={s} value={s}>{s}</option>)}</NativeSelect></label>
      {status?.configured && <label>Connection<NativeSelect value={mode} disabled={busy} onChange={e => { setMode(e.target.value as ProviderMode); setKey(''); }}><option value="configured">Configured server key</option><option value="key">One-time key · direct browser connection</option></NativeSelect></label>}
      {mode === 'key' && <label>Alpha Vantage API key<Input type="password" name="provider-key" value={key} autoComplete="off" spellCheck={false} minLength={8} maxLength={128} required disabled={busy} onChange={e => setKey(e.target.value)}/></label>}
      <p className="form-note">{mode === 'key' ? 'Direct browser connection: your key goes from this browser to Alpha Vantage. Only validated prices and their dates are sent back to MarketLab. Your key is not sent to the MarketLab server or saved in browser storage, and the field clears after submission.' : 'The configured key requests prices through the MarketLab server. Credentials are excluded from datasets and request history.'}</p><p className="form-note">One request per minute in MarketLab. Alpha Vantage’s own limits still apply; the app cooldown does not reset them. No requests are retried automatically.</p>
      {error && <><p role="alert" className="negative import-error">{error}</p><ProviderErrorDetails details={details}/>{mode === 'key' && <p className="form-note">Your key field was cleared after the attempt. Re-enter it before retrying.</p>}</>}<Button type="submit" disabled={busy || cooldown > 0}>{busy ? 'Fetching prices…' : cooldown > 0 ? `App cooldown · ${cooldown}s` : 'Fetch & save daily prices'}</Button>
    </form></DialogContent></Dialog>
  </section>;
}
