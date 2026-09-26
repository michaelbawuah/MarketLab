import { database, identity, json, failure, HttpError, requestBody } from '@/lib/server';
import { datasetFields, datasetSummary, type DatasetRow } from '@/lib/datasets';
import { validateActions, actionPerformance, actionsExport, type SavedActions } from '@/lib/finance/corporate-actions';
import type { SavedDataset } from '@/lib/finance/market-data';

async function ownedDataset(owner: string, id: unknown): Promise<SavedDataset> {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new HttpError('Invalid dataset ID.');
  const row = await database().prepare(`SELECT ${datasetFields}, observations FROM market_datasets WHERE owner = ? AND id = ?`).bind(owner, id).first<DatasetRow>();
  if (!row) throw new HttpError('Dataset not found.', 404);
  return { ...datasetSummary(row), observations: JSON.parse(row.observations!) };
}
type Row = { source: string; events: string; revision: number; updated: string };
function record(row: Row): SavedActions { return { source: row.source, events: JSON.parse(row.events), revision: row.revision, updated: row.updated, complete: true }; }
export async function GET(request: Request) {
  try {
    const owner = await identity(), params = new URL(request.url).searchParams, dataset = await ownedDataset(owner, params.get('id'));
    const row = await database().prepare('SELECT source, events, revision, updated FROM corporate_actions WHERE owner = ? AND dataset_id = ?').bind(owner, dataset.id).first<Row>();
    const actions = row ? record(row) : null;
    if (params.get('download') === '1') {
      if (!actions) throw new HttpError('Save an event record before exporting.', 404);
      return new Response(JSON.stringify(actionsExport(dataset.id, dataset, actions), null, 2), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="marketlab-${dataset.symbol}-actions-r${actions.revision}.json"`, 'Cache-Control': 'no-store' } });
    }
    return json({ actions });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const owner = await identity(), body = await requestBody(request, 32768) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['datasetId', 'revision', 'actions'].includes(k)) || !Number.isSafeInteger(body.revision) || (body.revision as number) < 0) throw new HttpError('Invalid event save request.');
    const dataset = await ownedDataset(owner, body.datasetId);
    let actions;
    try { actions = validateActions(body.actions, dataset); actionPerformance(dataset, actions); } catch (e) { throw new HttpError((e as Error).message); }
    const revision = body.revision as number, updated = new Date().toISOString(), db = database();
    const result = revision === 0
      ? await db.prepare('INSERT OR IGNORE INTO corporate_actions (owner, dataset_id, source, events, revision, updated) VALUES (?, ?, ?, ?, 1, ?)').bind(owner, dataset.id, actions.source, JSON.stringify(actions.events), updated).run()
      : await db.prepare('UPDATE corporate_actions SET source = ?, events = ?, revision = revision + 1, updated = ? WHERE owner = ? AND dataset_id = ? AND revision = ?').bind(actions.source, JSON.stringify(actions.events), updated, owner, dataset.id, revision).run();
    if (!result.meta.changes) throw new HttpError('This event record changed in another tab. Close the editor and reload its saved record before editing again.', 409);
    return json({ actions: { ...actions, revision: revision + 1, updated } }, revision === 0 ? 201 : 200);
  } catch (e) { return failure(e); }
}
