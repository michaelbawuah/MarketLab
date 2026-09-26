import { database, HttpError } from './server';
import { datasetId, MAX_DATASETS, type DatasetInput, type DatasetSummary } from './finance/market-data';
import type { ProviderProvenance } from './finance/provider';

export type DatasetRow = { id: string; symbol: string; source: string; basis: DatasetInput['basis']; price_column: DatasetInput['priceColumn']; kind: DatasetInput['kind']; count: number; first_date: string; last_date: string; created: string; observations?: string; origin: 'csv' | 'alphavantage'; provider_refreshed: string | null; provider_timezone: string | null };
export const datasetFields = 'id, symbol, source, basis, price_column, kind, count, first_date, last_date, created, origin, provider_refreshed, provider_timezone';
export function datasetSummary(row: DatasetRow): DatasetSummary { return { id: row.id, symbol: row.symbol, source: row.source, basis: row.basis, priceColumn: row.price_column, kind: row.kind, currency: 'USD', count: row.count, firstDate: row.first_date, lastDate: row.last_date, created: row.created, origin: row.origin, providerRefreshed: row.provider_refreshed, providerTimezone: row.provider_timezone }; }
export async function saveDataset(owner: string, d: DatasetInput, provenance?: ProviderProvenance) {
  let id = await datasetId(d);
  if (provenance) {
    // Keep existing CSV IDs stable. Provider origin cannot be asserted by a CSV uploader.
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['marketlab-provider-v1', id, provenance])));
    id = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  const db = database(), created = new Date().toISOString();
  const result = await db.prepare(`INSERT OR IGNORE INTO market_datasets (owner, id, symbol, source, basis, price_column, kind, count, first_date, last_date, created, observations, origin, provider_refreshed, provider_timezone)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM market_datasets WHERE owner = ?) < ?`)
    .bind(owner, id, d.symbol, d.source, d.basis, d.priceColumn, d.kind, d.observations.length, d.observations[0].date, d.observations.at(-1)!.date, created, JSON.stringify(d.observations), provenance?.origin ?? 'csv', provenance?.refreshed ?? null, provenance?.timezone ?? null, owner, MAX_DATASETS).run();
  const saved = await db.prepare(`SELECT ${datasetFields} FROM market_datasets WHERE owner = ? AND id = ?`).bind(owner, id).first<DatasetRow>();
  if (!saved) throw new HttpError(`This workspace has reached its ${MAX_DATASETS}-dataset limit.`, 409);
  const inserted = (result.meta.changes ?? 0) > 0;
  return { dataset: datasetSummary(saved), inserted, message: inserted ? `${d.observations.length} observations saved for ${d.symbol}.` : 'This exact dataset is already saved. No duplicate created.' };
}
