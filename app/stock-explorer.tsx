'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CloudDownload, Database, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { providerSymbols } from '@/lib/finance/provider';
import { latestProviderDatasets } from '@/lib/finance/market-explorer';
import type { DatasetSummary, SavedDataset } from '@/lib/finance/market-data';
import ProviderConnection from './provider-connection';
import ResearchChart from './research-chart';

const companies: Record<string, string> = { AAPL: 'Apple', AMZN: 'Amazon', GOOGL: 'Alphabet', IBM: 'IBM', MSFT: 'Microsoft', NVDA: 'NVIDIA', SPY: 'SPDR S&P 500 ETF' };
const price = (micros: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(Number(micros) / 1e6);
const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
async function readJSON<T>(response: Response): Promise<T> {
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error || 'Could not load saved provider prices.');
  return body as T;
}

export default function StockExplorer({ onOpenDataset }: { onOpenDataset: (id: string) => void }) {
  const [datasets, setDatasets] = useState<SavedDataset[]>([]), [selected, setSelected] = useState('IBM'), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const importedId = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await fetch('/api/datasets', { cache: 'no-store', signal: controller.signal }).then(readJSON<{ datasets: DatasetSummary[] }>);
        const summaries = latestProviderDatasets(result.datasets).filter(d => providerSymbols.some(s => s === d.symbol));
        const saved = await Promise.all(summaries.map(d => fetch(`/api/datasets?id=${d.id}`, { cache: 'no-store', signal: controller.signal }).then(readJSON<SavedDataset>)));
        if (controller.signal.aborted) return;
        setDatasets(saved); setError('');
        const requested = result.datasets.find(d => d.id === importedId.current);
        if (requested) setSelected(requested.symbol);
        importedId.current = null;
      } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);
  function reload(id?: string) { importedId.current = id ?? null; setLoading(true); setError(''); setRefresh(v => v + 1); }
  const dataset = datasets.find(d => d.symbol === selected), latest = dataset?.observations.at(-1), previous = dataset?.observations.at(-2);
  const change = latest && previous ? Number(BigInt(latest.priceMicros) - BigInt(previous.priceMicros)) / Number(previous.priceMicros) * 100 : null;
  const matches = providerSymbols.filter(s => `${s} ${companies[s]}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className="research-workspace market-explorer">
    <div className="market-intro"><span className="provider-icon"><CloudDownload size={24}/></span><div><h2>Market prices, with their source.</h2><p>Explore saved daily closes fetched directly from Alpha Vantage. Every price carries its observation date. Fetch on demand to update your snapshots.</p></div><span className="provider-tag">DAILY CLOSES</span></div>
    <div className="market-tools"><div className="search-field"><Search size={17}/><Input aria-label="Search market symbols" placeholder="Search company or symbol…" value={search} onChange={e => setSearch(e.target.value)}/></div><span>{datasets.length} of {providerSymbols.length} symbols saved</span><Button variant="outline" onClick={() => reload()} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/> Reload saved prices</Button></div>
    {error && <div className="error-banner" role="alert">{error} Previously loaded snapshots keep their original dates. <button onClick={() => reload()}>Retry</button></div>}
    {loading && <p className="research-muted" role="status">Loading saved provider prices…</p>}
    <div className="market-grid">{matches.map(symbol => {
      const saved = datasets.find(d => d.symbol === symbol), close = saved?.observations.at(-1);
      return <button className={`panel market-card ${symbol === selected ? 'is-selected' : ''}`} key={symbol} onClick={() => setSelected(symbol)} aria-pressed={symbol === selected}>
        <div className="market-card-heading"><span className="asset-monogram">{symbol[0]}</span><span><strong>{symbol}</strong><small>{companies[symbol]}</small></span><ArrowRight size={16}/></div>
        {close ? <><strong className="market-card-price">{price(close.priceMicros)}</strong><span className="market-card-date">Close · {close.date}</span><small className="market-card-source">Alpha Vantage · unadjusted</small></> : <><strong className="market-card-empty">{loading ? 'Loading…' : error ? 'Unavailable' : 'Not fetched yet'}</strong><span className="market-card-date">{symbol === 'IBM' ? 'Public provider access available' : 'Provider key required to fetch'}</span><small className="market-card-source">Select to view fetch options</small></>}
      </button>;
    })}</div>
    {!matches.length && <div className="panel empty-state">No supported symbols match “{search}”. Try NVIDIA or IBM.</div>}
    {dataset && latest ? <section className="panel market-detail">
      <div className="panel-heading"><div><h2>{selected} · {companies[selected]}</h2><p>Saved daily history · {dataset.firstDate} → {dataset.lastDate}</p></div><Button variant="outline" onClick={() => onOpenDataset(dataset.id)}><Database size={16}/> Dataset & provenance</Button></div>
      <div className="market-quote"><div><span>Unadjusted daily close · USD</span><strong>{price(latest.priceMicros)}</strong><small>Observation date: {latest.date}</small></div>{previous && change !== null && <div><span>Change from previous observation</span><strong className={change >= 0 ? 'positive' : 'negative'}>{percent(change)}</strong><small>{previous.date} → {latest.date} · excludes dividends</small></div>}</div>
      <ResearchChart key={dataset.id} dataset={dataset}/>
      <dl className="market-source"><div><dt>Source</dt><dd>{dataset.source}</dd></div><div><dt>Saved (UTC)</dt><dd>{dataset.created.replace('T', ' ').slice(0, 19)}</dd></div><div><dt>Provider refreshed</dt><dd>{dataset.providerRefreshed} · {dataset.providerTimezone}</dd></div></dl>
      <div className="research-chart-note">This is a saved close, not a live quote. The newest observation available in your saved snapshots is shown. Lines connect supplied observations without filling gaps. Unadjusted changes can reflect stock splits.</div>
    </section> : !loading && <section className="panel market-empty"><CloudDownload size={28}/><div><h2>{selected} · {error ? 'Price unavailable' : 'Ready for market data'}</h2><p>{error ? 'Reload saved prices or check the provider connection below.' : selected === 'IBM' ? 'Fetch IBM below using the provider’s public demo key. Its prices come from Alpha Vantage.' : `Fetch ${selected} below with a one-time or configured Alpha Vantage key. No provider price has been saved for this symbol.`}</p></div></section>}
    <ProviderConnection requestedSymbol={selected} onImported={id => reload(id)} onViewDataset={onOpenDataset}/>
    <p className="research-muted">CSV imports remain available in Historical data. Demo portfolio prices belong to the separate Demo section.</p>
  </div>;
}
