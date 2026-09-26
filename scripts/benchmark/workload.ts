import { createHash } from 'node:crypto';
import { validateImport, datasetId } from '../../lib/finance/market-data.ts';
import { analyzeResearch, researchFingerprint, RESEARCH_METHOD, type ResearchSnapshot, type ResearchAnalysis } from '../../lib/finance/research.ts';
import { validateResearchSnapshot } from '../../lib/finance/research-input.ts';

export const WORKLOAD_VERSION = 'marketlab-service-load-v1';
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type Profile = { snapshot: ResearchSnapshot; analysisHash: string; analysis: ResearchAnalysis };
export type PreparedJob = { index: number; profile: number; owner: string; id: string; body: string; snapshotHash: string; analysisHash: string };

/** Integer-generated fictional observations, with a separate benchmark and no events. */
export async function workloadProfiles(observations: number): Promise<Profile[]> {
  if (!Number.isSafeInteger(observations) || observations < 100 || observations > 1000) throw new Error('Use 100–1000 observations.');
  async function binding(symbol: string, seed: number) {
    let state = seed, cents = 10000;
    const rows = Array.from({ length: observations }, (_, i) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      cents += (state % 161) - 80 + (Math.floor(i / 25) % 2 ? -6 : 6);
      const date = new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10);
      return `${date},${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
    });
    const input = validateImport({ symbol, source: `${WORKLOAD_VERSION} · fictional seed ${seed}`, kind: 'synthetic', basis: 'raw', priceColumn: 'close', csv: 'date,close\n' + rows.join('\n') });
    const dataset = { ...input, id: await datasetId(input), count: observations, firstDate: input.observations[0].date, lastDate: input.observations.at(-1)!.date, created: '2026-09-26T00:00:00Z' };
    return { dataset, actions: { source: 'Fictional no-event coverage', complete: true as const, events: [], revision: 1, updated: '2026-09-26T00:00:00Z' } };
  }
  const asset = await binding('XLOAD', 42), benchmark = await binding('XREF', 819);
  return Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const snapshot: ResearchSnapshot = { method: RESEARCH_METHOD, asset, benchmark, config: {
      name: `Load profile ${i}`, assetId: asset.dataset.id, benchmarkId: benchmark.dataset.id,
      start: asset.dataset.observations[40].date, end: asset.dataset.lastDate,
      holdoutStart: asset.dataset.observations[Math.floor(observations * .7)].date,
      window: [5, 10, 20, 40][i % 4], initialCash: '10000', feeBps: i < 4 ? 0 : 5,
      slippageBps: i < 4 ? 0 : 3, confirmed: true,
    } };
    await validateResearchSnapshot(snapshot);
    const analysis = analyzeResearch(snapshot);
    return { snapshot, analysis, analysisHash: digest(analysis) };
  }));
}

export async function prepareJobs(profiles: Profile[], count: number, phase: string): Promise<PreparedJob[]> {
  // At most 25 jobs per fictional owner, below the production 30-job quota.
  // Every name changes the complete input hash; no timed job is a cache hit.
  const jobs: PreparedJob[] = [];
  for (let index = 0; index < count; index++) {
    const profile = index % profiles.length, base = profiles[profile];
    const snapshot = { ...base.snapshot, config: { ...base.snapshot.config, name: `${phase} job ${index}` } };
    jobs.push({ index, profile, owner: `${phase}-owner-${Math.floor(index / 25)}`, id: await researchFingerprint(snapshot), body: JSON.stringify({ snapshot }), snapshotHash: digest(snapshot), analysisHash: base.analysisHash });
  }
  return jobs;
}

export function assertCorrectResult(value: unknown, expected: PreparedJob, mode: 'typescript' | 'cpp-verify') {
  const job = value as { id?: string; status?: string; attempts?: number; snapshot?: unknown; analysis?: unknown; verification?: { engine?: string; comparisons?: number; maxAbsoluteError?: number } };
  if (!job || job.id !== expected.id || job.status !== 'completed' || job.attempts !== 1) throw new Error('Result identity, completion or attempt check failed.');
  if (digest(job.snapshot) !== expected.snapshotHash || digest(job.analysis) !== expected.analysisHash) throw new Error('Frozen input or canonical result mismatch.');
  const v = job.verification;
  if (!v || !Number.isFinite(v.maxAbsoluteError) || v.maxAbsoluteError! < 0 || (mode === 'cpp-verify'
    ? v.engine !== 'cpp-node-api-v1' || v.comparisons !== 9
    : v.engine !== 'typescript-reference' || v.comparisons !== 0 || v.maxAbsoluteError !== 0)) throw new Error('Verification receipt mismatch.');
}
