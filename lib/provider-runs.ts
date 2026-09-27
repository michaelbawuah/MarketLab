import { database } from './server';
import { ProviderError, type ProviderRun } from './finance/provider';

/** Both connection paths share the same atomic owner-level cooldown. */
export async function reserveProviderRun(owner: string, symbol: string, mode: ProviderRun['mode']) {
  const db = database(), now = new Date(), id = crypto.randomUUID();
  const claim = await db.prepare(`INSERT INTO provider_runs (id, owner, symbol, mode, started, status, records, dataset_id, message)
    SELECT ?, ?, ?, ?, ?, 'running', 0, NULL, 'Requesting daily prices' WHERE NOT EXISTS (SELECT 1 FROM provider_runs WHERE owner = ? AND started > ?)`)
    .bind(id, owner, symbol, mode, now.toISOString(), owner, new Date(now.getTime() - 60000).toISOString()).run();
  if (!claim.meta.changes) throw new ProviderError('cooldown', 'Wait one minute between provider requests. Saved datasets remain available without another request.', 429);
  return id;
}
