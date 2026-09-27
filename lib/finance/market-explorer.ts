import type { DatasetSummary } from './market-data.ts';

/** Newest observed close wins, even when an older snapshot was imported later. */
export function latestProviderDatasets(datasets: DatasetSummary[]): DatasetSummary[] {
  const latest = new Map<string, DatasetSummary>();
  const ordered = datasets.filter(d => (d.origin === 'alphavantage' || d.origin === 'alphavantage-browser') && d.kind === 'historical' && d.basis === 'raw' && d.priceColumn === 'close')
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.created.localeCompare(a.created) || b.id.localeCompare(a.id));
  for (const dataset of ordered) if (!latest.has(dataset.symbol)) latest.set(dataset.symbol, dataset);
  return [...latest.values()];
}
