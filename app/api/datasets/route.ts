import { database, identity, json, failure, HttpError, requestBody } from '@/lib/server';
import { validateImport, datasetCSV, MAX_DATASETS, MAX_CSV_BYTES, type SavedDataset, type DatasetInput } from '@/lib/finance/market-data';

import { datasetFields as fields, datasetSummary as summary, saveDataset, type DatasetRow as Row } from '@/lib/datasets';

export async function GET(request: Request) {
  try {
    const owner = await identity(), db = database(), params = new URL(request.url).searchParams, id = params.get('id');
    if (!id) {
      const rows = await db.prepare(`SELECT ${fields} FROM market_datasets WHERE owner = ? ORDER BY created DESC, id LIMIT ?`).bind(owner, MAX_DATASETS).all<Row>();
      return json({ datasets: rows.results.map(summary), limit: MAX_DATASETS });
    }
    if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpError('Invalid dataset ID.');
    const row = await db.prepare(`SELECT ${fields}, observations FROM market_datasets WHERE owner = ? AND id = ?`).bind(owner, id).first<Row>();
    if (!row) throw new HttpError('Dataset not found.', 404);
    const dataset: SavedDataset = { ...summary(row), observations: JSON.parse(row.observations!) };
    if (params.get('download') === '1') return new Response(datasetCSV(dataset), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="marketlab-${dataset.symbol}-${id.slice(0, 8)}.csv"`, 'Cache-Control': 'no-store' } });
    return json(dataset);
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const owner = await identity(), body = await requestBody(request, MAX_CSV_BYTES * 6 + 4096);
    let d: DatasetInput;
    try { d = validateImport(body); } catch (e) { throw new HttpError((e as Error).message); }
    const saved = await saveDataset(owner, d);
    return json(saved, saved.inserted ? 201 : 200);
  } catch (e) { return failure(e); }
}
