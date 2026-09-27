import { env } from 'cloudflare:workers';
import { identity, database, json, requestBody, failure, HttpError } from '@/lib/server';
import { saveDataset } from '@/lib/datasets';
import { fetchDailyPrices, providerRequest, ProviderError, type ProviderRun } from '@/lib/finance/provider';

export async function GET() {
  try {
    const owner = await identity();
    const rows = await database().prepare('SELECT id, symbol, mode, started, status, records, dataset_id, message FROM provider_runs WHERE owner = ? ORDER BY started DESC LIMIT 10').bind(owner).all<ProviderRun>();
    return json({ configured: !!env.ALPHA_VANTAGE_API_KEY?.trim(), runs: rows.results });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  let owner = '', id = '';
  try {
    owner = await identity();
    const { symbol, mode, key } = providerRequest(await requestBody(request), env.ALPHA_VANTAGE_API_KEY);
    const db = database(), now = new Date(), started = now.toISOString(); id = crypto.randomUUID();
    // The reservation and cooldown check are one atomic statement. No key is stored.
    const claim = await db.prepare(`INSERT INTO provider_runs (id, owner, symbol, mode, started, status, records, dataset_id, message)
      SELECT ?, ?, ?, ?, ?, 'running', 0, NULL, 'Requesting daily prices' WHERE NOT EXISTS (SELECT 1 FROM provider_runs WHERE owner = ? AND started > ?)`)
      .bind(id, owner, symbol, mode, started, owner, new Date(now.getTime() - 60000).toISOString()).run();
    if (!claim.meta.changes) { id = ''; throw new ProviderError('cooldown', 'Wait one minute between provider requests. Saved datasets remain available without another request.', 429); }
    const result = await fetchDailyPrices(symbol, key);
    const saved = await saveDataset(owner, result.dataset, result.provenance);
    try {
      await db.prepare('UPDATE provider_runs SET status = ?, records = ?, dataset_id = ?, message = ? WHERE owner = ? AND id = ?').bind('completed', result.dataset.observations.length, saved.dataset.id, saved.message, owner, id).run();
    } catch {
      // A history-write failure must not misrepresent a successfully saved dataset as lost.
      return json({ ...saved, historyWarning: 'Prices were saved, but the run history could not be finalized.' });
    }
    return json(saved, saved.inserted ? 201 : 200);
  } catch (e) {
    const message = e instanceof ProviderError || e instanceof HttpError ? e.message : 'Could not save provider data. Check saved datasets before retrying.';
    if (id) try { await database().prepare('UPDATE provider_runs SET status = ?, message = ? WHERE owner = ? AND id = ?').bind('failed', message, owner, id).run(); } catch { /* Keep errors and credentials out of logs. */ }
    // Diagnostics are returned only to the authenticated owner. Provider text is
    // redacted at the fetch boundary and is never saved to run history or logs.
    if (e instanceof ProviderError) return json({ error: e.message, code: e.code, diagnostic: e.diagnostic, requestId: id || undefined }, e.status);
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: message }, 503);
  }
}
