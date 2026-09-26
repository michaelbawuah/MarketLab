import test from 'node:test';
import assert from 'node:assert/strict';
import { distribution, summarizeSamples, type JobSample } from '../../scripts/benchmark/statistics.ts';
import { workloadProfiles, prepareJobs, assertCorrectResult, digest } from '../../scripts/benchmark/workload.ts';
import { parseOptions } from '../../scripts/benchmark-service.ts';

test('nearest-rank percentiles retain the slow tail instead of averaging or interpolating it', () => {
  const samples = Array.from({ length: 100 }, (_, i) => i + 1).reverse();
  const d = distribution(samples)!;
  assert.deepEqual([d.count, d.minMs, d.meanMs, d.p50Ms, d.p95Ms, d.p99Ms, d.maxMs], [100, 1, 50.5, 50, 95, 99, 100]);
  assert.equal(samples[0], 100); assert.equal(distribution([]), null);
  for (const values of [[NaN], [Infinity], [-1]]) assert.throws(() => distribution(values), /finite and nonnegative/);
});

test('failed and undispatched jobs reduce goodput and invalidate a run without disappearing', () => {
  const ok: JobSample = { index: 0, profile: 0, id: 'a', startMs: 0, submitMs: 10, completedObservedMs: 70, totalMs: 100, polls: 2, ok: true };
  const bad: JobSample = { index: 1, profile: 1, id: 'b', startMs: 0, totalMs: 200, polls: 1, ok: false, error: 'timeout' };
  const s = summarizeSamples([ok, bad], 3, 1000);
  assert.equal(s.verifiedJobsPerSecond, 1); assert.equal(s.failed, 1); assert.equal(s.notStarted, 1); assert.equal(s.valid, false);
  assert.equal(s.verifiedResult!.count, 1); assert.equal(s.failedElapsed!.maxMs, 200);
  assert.throws(() => summarizeSamples([ok, ok], 2, 1000), /accounting/);
  assert.throws(() => summarizeSamples([{ ...ok, totalMs: 20 }], 1, 1000), /boundaries/);
});

test('the frozen workload is deterministic, covers eight cost/window profiles and never hits per-owner quota', async () => {
  const profiles = await workloadProfiles(100), repeated = await workloadProfiles(100);
  assert.equal(digest(profiles), digest(repeated)); assert.equal(profiles.length, 8);
  assert.equal(new Set(profiles.map(p => p.analysisHash)).size, 8);
  assert.notEqual(profiles[0].snapshot.asset.dataset.id, profiles[0].snapshot.benchmark.dataset.id);
  const jobs = await prepareJobs(profiles, 76, 'unit-load');
  assert.equal(new Set(jobs.map(j => j.id)).size, 76);
  const owners = Map.groupBy(jobs, j => j.owner); assert.equal(owners.size, 4);
  assert.ok([...owners.values()].every(group => group.length <= 25));
});

test('incorrect inputs, results, completion, attempts or verification cannot pass a fast benchmark', async () => {
  const profiles = await workloadProfiles(100), [job] = await prepareJobs(profiles, 1, 'unit-load');
  const valid = { id: job.id, status: 'completed', attempts: 1, snapshot: JSON.parse(job.body).snapshot, analysis: profiles[0].analysis,
    verification: { engine: 'cpp-node-api-v1', comparisons: 9, maxAbsoluteError: 1e-14 } };
  assert.doesNotThrow(() => assertCorrectResult(valid, job, 'cpp-verify'));
  for (const patch of [{ id: 'wrong' }, { status: 'failed' }, { attempts: 2 }, { snapshot: {} }, { analysis: {} }, { verification: { engine: 'cpp-node-api-v1', comparisons: 0, maxAbsoluteError: 0 } }]) assert.throws(() => assertCorrectResult({ ...valid, ...patch }, job, 'cpp-verify'));
  assert.throws(() => assertCorrectResult(valid, job, 'typescript'), /receipt/);
});

test('load-run options are bounded and require a new explicit output destination', () => {
  const d = parseOptions(['--output', '/tmp/example-load']); assert.equal(d.jobs, 1000); assert.equal(d.mode, 'cpp-verify');
  for (const args of [[], ['--jobs', '0'], ['--jobs', '1000000'], ['--mode', 'silent'], ['--workers', '9'], ['--jobs', '1', '--concurrency', '2'], ['--output', 'x', '--output', 'y'], ['--unknown', '1']]) assert.throws(() => parseOptions(args));
});
