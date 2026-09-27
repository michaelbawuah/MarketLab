import { identity, database, json, requestBody, HttpError } from '@/lib/server';
import { saveDataset } from '@/lib/datasets';
import { reserveProviderRun } from '@/lib/provider-runs';
import { providerSymbols, ProviderError, type ProviderRun } from '@/lib/finance/provider';
import { normalizeBrowserTransfer } from '@/lib/finance/browser-provider';

export async function POST(request: Request) {
  let owner = '', claimed = '';
  try {
    owner = await identity();
    const input = await requestBody(request, 16384);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError('Invalid browser request.');
    const body = input as Record<string, unknown>;
    if (body.action === 'start') {
      if (Object.keys(body).sort().join(',') !== 'action,symbol' || typeof body.symbol !== 'string' || !providerSymbols.some(s => s === body.symbol)) throw new HttpError('Choose a supported symbol.');
      return json({ requestId: await reserveProviderRun(owner, body.symbol, 'browser') }, 201);
    }
    const expectedFields = body.action === 'complete' ? 'action,data,requestId' : body.action === 'fail' ? 'action,requestId' : '';
    if (!expectedFields || Object.keys(body).sort().join(',') !== expectedFields || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.requestId)) throw new HttpError('Invalid browser request.');
    const db = database();
    const run = await db.prepare('SELECT id, symbol, status, started FROM provider_runs WHERE owner = ? AND id = ? AND mode = ?').bind(owner, body.requestId, 'browser').first<Pick<ProviderRun, 'id' | 'symbol' | 'status' | 'started'>>();
    if (!run) throw new HttpError('Browser request not found.', 404);
    if (body.action === 'fail') {
      await db.prepare("UPDATE provider_runs SET status = 'failed', message = 'Browser connection did not finish. Check saved datasets before retrying.' WHERE owner = ? AND id = ? AND status = 'running'").bind(owner, run.id).run();
      return json({ recorded: true });
    }
    const expiresBefore = new Date(Date.now() - 5 * 60000).toISOString();
    if (run.status !== 'running' || run.started < expiresBefore) throw new HttpError('This browser request has finished or expired. Check saved datasets before retrying.', 409);
    const result = normalizeBrowserTransfer(body.data, run.symbol);
    // One completion can claim a run. Replays, concurrent submits and another
    // owner's ID cannot insert additional data through this reservation.
    const claim = await db.prepare("UPDATE provider_runs SET status = 'saving' WHERE owner = ? AND id = ? AND mode = 'browser' AND status = 'running' AND started >= ?").bind(owner, run.id, expiresBefore).run();
    if (!claim.meta.changes) throw new HttpError('This browser request is already being saved or has finished.', 409);
    claimed = run.id;
    const saved = await saveDataset(owner, result.dataset, result.provenance);
    try {
      await db.prepare("UPDATE provider_runs SET status = 'completed', records = ?, dataset_id = ?, message = ? WHERE owner = ? AND id = ? AND status = 'saving'").bind(result.dataset.observations.length, saved.dataset.id, saved.message, owner, run.id).run();
    } catch { return json({ ...saved, historyWarning: 'Prices were saved, but the run history could not be finalized.' }); }
    return json(saved, saved.inserted ? 201 : 200);
  } catch (e) {
    const known = e instanceof ProviderError || e instanceof HttpError;
    const message = known ? e.message : 'Could not save browser data. Check saved datasets before trying again.';
    if (claimed) try { await database().prepare("UPDATE provider_runs SET status = 'failed', message = ? WHERE owner = ? AND id = ? AND status = 'saving'").bind(message, owner, claimed).run(); } catch { /* No payloads or credentials in logs. */ }
    return json({ error: message, ...(e instanceof ProviderError ? { code: e.code } : {}) }, known ? e.status : 503);
  }
}
