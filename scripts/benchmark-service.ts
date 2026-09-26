import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { cpus, availableParallelism, release, totalmem } from 'node:os';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient } from 'mongodb';
import { signResearchRequest } from '../lib/research-signing.ts';
import { workloadProfiles, prepareJobs, assertCorrectResult, digest, WORKLOAD_VERSION, type PreparedJob } from './benchmark/workload.ts';
import { distribution, summarizeSamples, type JobSample } from './benchmark/statistics.ts';
import { startMongo, startService, messageFrom } from './benchmark/processes.ts';

type Options = { jobs: number; concurrency: number; workers: number; repetitions: number; observations: number; warmup: number; pollMs: number; mode: 'cpp-verify' | 'typescript'; output: string };
const root = fileURLToPath(new URL('../', import.meta.url));

export function parseOptions(args: string[]): Options {
  const result: Options = { jobs: 1000, concurrency: 8, workers: 2, repetitions: 3, observations: 500, warmup: 32, pollMs: 50, mode: 'cpp-verify', output: '' };
  const seen = new Set<string>();
  const bounds = { jobs: [1, 3000], concurrency: [1, 32], workers: [1, 8], repetitions: [1, 5], observations: [100, 1000], warmup: [8, 100], pollMs: [10, 1000] } as const;
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2), value = args[i + 1];
    if (!args[i].startsWith('--') || !value || seen.has(key)) throw new Error('Use unique --option value pairs. --output must name a new directory.');
    seen.add(key);
    if (key === 'output') result.output = resolve(value);
    else if (key === 'mode' && ['cpp-verify', 'typescript'].includes(value)) result.mode = value as Options['mode'];
    else if (key in bounds) {
      const k = key as keyof typeof bounds, n = Number(value), [min, max] = bounds[k];
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${key} must be ${min}–${max}.`);
      result[k] = n;
    } else throw new Error(`Unknown or invalid option: ${args[i]}`);
  }
  if (!result.output || result.concurrency > result.jobs) throw new Error('Provide --output and use concurrency no greater than jobs.');
  return result;
}

async function optionalFile(path: string) { try { return (await readFile(path, 'utf8')).trim(); } catch { return null; } }
async function sourceManifest() {
  const files = ['package.json', 'pnpm-lock.yaml', 'lib/research-signing.ts', 'scripts/benchmark-service.ts', 'native/risk.cc', 'native/build/marketlab_risk.node'];
  for (const directory of ['lib/finance', 'services/research', 'scripts/benchmark']) {
    for (const name of (await readdir(join(root, directory))).sort()) if (name.endsWith('.ts')) files.push(`${directory}/${name}`);
  }
  const hashes: Record<string, string | null> = {};
  for (const path of files.sort()) {
    try { hashes[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex'); }
    catch (e) { if (path.endsWith('.node')) hashes[path] = null; else throw e; }
  }
  return { baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    workingTreeHadChanges: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    relevantSourceSha256: digest(hashes), files: hashes };
}

type RequestSummary = { count: number; responseBytes: number; statusCounts: Record<string, number>; latency: ReturnType<typeof distribution> };
type RequestSamples = { durations: number[]; responseBytes: number; statusCounts: Record<string, number> };
async function runPhase(origin: string, secret: string, jobs: PreparedJob[], options: Options, cancelled: AbortSignal, progress: boolean) {
  const requests: Record<string, RequestSamples> = Object.fromEntries(['submit', 'status', 'result'].map(k => [k, { durations: [], responseBytes: 0, statusCounts: {} }]));
  const samples: JobSample[] = [], deadline = AbortSignal.timeout(10 * 60 * 1000), phaseSignal = AbortSignal.any([deadline, cancelled]);
  let next = 0;
  const started = performance.now();
  async function request(owner: string, method: string, path: string, body: string, kind: keyof typeof requests, signal: AbortSignal) {
    const t = performance.now(), metric = requests[kind];
    try {
      const headers = await signResearchRequest(secret, owner, method, path, body);
      const response = await fetch(origin + path, { method, headers: { ...headers, 'Content-Type': 'application/json' },
        body: method === 'POST' ? body : undefined, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      const raw = await response.text(), bytes = Buffer.byteLength(raw);
      metric.responseBytes += bytes; metric.statusCounts[response.status] = (metric.statusCounts[response.status] ?? 0) + 1;
      if (!response.ok) throw new Error(`${kind} HTTP ${response.status}`);
      return { status: response.status, data: JSON.parse(raw), bytes };
    } catch (e) {
      if (signal.aborted) throw new Error(`${kind} deadline or cancellation`);
      throw e;
    } finally { metric.durations.push(performance.now() - t); }
  }
  async function lane() {
    while (next < jobs.length && !phaseSignal.aborted) {
      const expected = jobs[next++], t = performance.now();
      const sample: JobSample = { index: expected.index, profile: expected.profile, id: expected.id, startMs: t - started, totalMs: 0, polls: 0, ok: false };
      const signal = AbortSignal.any([phaseSignal, AbortSignal.timeout(30000)]);
      try {
        const submitted = await request(expected.owner, 'POST', '/v1/jobs', expected.body, 'submit', signal);
        sample.submitMs = performance.now() - t;
        if (submitted.status !== 202 || submitted.data.job?.id !== expected.id) throw new Error('Fresh job was not accepted with its expected ID.');
        while (true) {
          sample.polls++;
          const status = await request(expected.owner, 'GET', `/v1/jobs/${expected.id}/status`, '', 'status', signal);
          if (status.data.job?.id !== expected.id) throw new Error('Status identity mismatch.');
          if (status.data.job.status === 'completed') break;
          if (!['queued', 'running'].includes(status.data.job.status)) throw new Error('Job did not complete successfully.');
          await delay(options.pollMs, undefined, { signal });
        }
        sample.completedObservedMs = performance.now() - t;
        const result = await request(expected.owner, 'GET', `/v1/jobs/${expected.id}`, '', 'result', signal);
        assertCorrectResult(result.data.job, expected, options.mode);
        sample.resultBytes = result.bytes; sample.ok = true;
      } catch (e) { sample.error = e instanceof Error ? e.message.slice(0, 160) : 'Benchmark job failed.'; }
      sample.totalMs = performance.now() - t; samples.push(sample);
      if (progress && (samples.length % 100 === 0 || samples.length === jobs.length)) console.log(`Verified ${samples.filter(s => s.ok).length}/${jobs.length}; finished ${samples.length}; elapsed ${((performance.now() - started) / 1000).toFixed(1)} s.`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency, jobs.length) }, lane));
  const durationMs = performance.now() - started;
  const requestSummary: Record<string, RequestSummary> = Object.fromEntries(Object.entries(requests).map(([name, r]) => [name, {
    count: r.durations.length, responseBytes: r.responseBytes, statusCounts: r.statusCounts, latency: distribution(r.durations),
  }]));
  return { summary: summarizeSamples(samples, jobs.length, durationMs), requests: requestSummary, samples: samples.sort((a, b) => a.index - b.index) };
}

export async function benchmark(options: Options) {
  await mkdir(options.output); // Refuse overwrite, including earlier failed evidence.
  const cancelled = new AbortController(), cancel = () => cancelled.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  const trials: Array<{ summary: Awaited<ReturnType<typeof runPhase>>['summary']; samples: JobSample[]; [key: string]: unknown }> = [];
  try {
    const source = await sourceManifest(), profiles = await workloadProfiles(options.observations);
    const environment = { node: process.version, platform: process.platform, architecture: process.arch, kernel: release(),
      cpuModel: cpus()[0]?.model, visibleLogicalCpus: cpus().length, availableParallelism: availableParallelism(),
      hostVisibleMemoryBytes: totalmem(), cgroupCpuMax: await optionalFile('/sys/fs/cgroup/cpu.max'), cgroupMemoryMax: await optionalFile('/sys/fs/cgroup/memory.max'), cgroupCpuSet: await optionalFile('/sys/fs/cgroup/cpuset.cpus.effective'), sharedRuntime: true };
    await writeFile(join(options.output, 'workload.json'), JSON.stringify({ version: WORKLOAD_VERSION, profiles: profiles.map(p => ({ snapshot: p.snapshot, expectedAnalysisSha256: p.analysisHash })) }, null, 2) + '\n', { flag: 'wx' });
    await writeFile(join(options.output, 'manifest.json'), JSON.stringify({ source, environment, options }, null, 2) + '\n', { flag: 'wx' });
    for (let repetition = 1; repetition <= options.repetitions; repetition++) {
      if (cancelled.signal.aborted) throw new Error('Benchmark cancelled.');
      console.log(`Trial ${repetition}/${options.repetitions}: ${options.jobs} fresh jobs, ${options.concurrency} clients, ${options.workers} workers, ${options.observations} observations, ${options.mode}.`);
      const phase = `load-t${repetition}`, jobs = await prepareJobs(profiles, options.jobs, phase), warmJobs = await prepareJobs(profiles, options.warmup, `warm-t${repetition}`);
      const mongo = await startMongo(process.env.MONGOD_BIN || 'mongod');
      const database = `marketlab_benchmark_${randomUUID().replaceAll('-', '')}`, secret = randomBytes(32).toString('hex');
      let service: Awaited<ReturnType<typeof startService>> | undefined, inspector: MongoClient | undefined;
      try {
        inspector = new MongoClient(mongo.uri, { timeoutMS: 5000 }); await inspector.connect();
        const mongoVersion = (await inspector.db('admin').command({ buildInfo: 1 })).version as string;
        service = await startService({ uri: mongo.uri, database, secret, host: '127.0.0.1', port: 0, workers: options.workers, mode: options.mode });
        const warm = await runPhase(service.origin, secret, warmJobs, options, cancelled.signal, false);
        if (!warm.summary.valid) throw new Error('Warm-up failed; no valid performance result can be published.');
        const measuring = messageFrom(service.child, 'measuring'); service.child.send({ type: 'measure' }); await measuring;
        const driverCpu = process.cpuUsage(), measuredAt = new Date().toISOString();
        const measured = await runPhase(service.origin, secret, jobs, options, cancelled.signal, true);
        const driverUsage = process.cpuUsage(driverCpu);
        const metrics = messageFrom(service.child, 'metrics'); service.child.send({ type: 'metrics' });
        const serviceMetrics = await metrics;
        // Inspect only our disposable database, after the timed interval.
        const rows = await inspector.db(database).collection('research_jobs').find({ owner: { $regex: `^${phase}-owner-` } }, { projection: { owner: 1, id: 1, status: 1, attempts: 1 } }).toArray();
        const expected = new Set(jobs.map(j => `${j.owner}:${j.id}`));
        const durableResultsVerified = rows.length === jobs.length && rows.every(row => expected.delete(`${row.owner}:${row.id}`) && row.status === 'completed' && row.attempts === 1) && expected.size === 0;
        measured.summary.valid &&= durableResultsVerified;
        const trial = { repetition, measuredAt, mongoVersion, ...measured, durableResultsVerified,
          persistedMeasuredJobs: rows.length, warmup: warm.summary, serviceMetrics,
          driverMetrics: { cpuUserMs: driverUsage.user / 1000, cpuSystemMs: driverUsage.system / 1000, processLifetimeMaxRssKiB: process.resourceUsage().maxRSS },
          serviceDiagnosticLines: service.diagnostics() };
        trials.push(trial);
        await writeFile(join(options.output, `trial-${repetition}.json`), JSON.stringify(trial, null, 2) + '\n', { flag: 'wx' });
        console.log(`Trial ${repetition}: ${measured.summary.verifiedJobsPerSecond.toFixed(2)} verified jobs/s; p99 ${measured.summary.verifiedResult?.p99Ms.toFixed(1)} ms; valid=${measured.summary.valid}.`);
        if (!measured.summary.valid) throw new Error('Correctness or completion gate failed; the trial is not accepted.');
      } finally { if (service) await service.close(); if (inspector) await inspector.close(); await mongo.close(); }
    }
    const totalMs = trials.reduce((n, t) => n + t.summary.durationMs, 0), completed = trials.reduce((n, t) => n + t.summary.completedAndVerified, 0);
    const report = { format: WORKLOAD_VERSION, measuredAt: new Date().toISOString(), valid: trials.length === options.repetitions && trials.every(t => t.summary.valid), source, environment, options,
      workload: { profiles: profiles.map((p, i) => ({ index: i, snapshotSha256: digest(p.snapshot), analysisSha256: p.analysisHash, window: p.snapshot.config.window, feeBps: p.snapshot.config.feeBps, slippageBps: p.snapshot.config.slippageBps, evaluatedObservations: p.analysis.full.observations, fullPeriodTrades: p.analysis.full.strategy.trades.length, resultBytes: Buffer.byteLength(JSON.stringify(p.analysis)) })), observationsPerInstrument: options.observations, instruments: 2, initialCashUsd: '10000', eventsPerInstrument: 0, synthetic: true },
      method: { model: 'Closed-loop: each client submits, polls, retrieves and verifies one job before starting its next job. This is not a fixed-arrival-rate saturation test.',
        timing: 'Monotonic client clock, before submission HMAC signing to after full-result parsing and correctness verification. Includes HTTP, queueing, worker work, Mongo writes, polling and result transfer. Fixture preparation and startup are excluded.',
        completion: `Client-observed durable completion, polled after each status response with a ${options.pollMs} ms delay. Detection and event-loop scheduling are included; server-only compute latency is not inferred.`,
        percentile: 'Nearest rank: sorted[ceil(p*n)-1]. Raw per-job samples are retained. Combined percentiles are recomputed from all samples, never averaged.',
        throughput: 'Verified measured jobs divided by the interval from launching the first client until every measured client finishes, including its full-result checks.',
        isolation: 'A fresh loopback-only MongoDB process/database and separate Node service process for each repetition; 256 MiB WiredTiger cache. The load generator, service and database share the same machine.',
        warmup: `${options.warmup} distinct jobs per repetition, excluded from measured summaries. New measured jobs keep the normal 30-job owner quota; at most 25 jobs per synthetic owner.`,
        correctness: 'All measured HTTP results must match frozen input and precomputed canonical TypeScript analysis hashes, have one attempt, and carry the configured verification receipt. Post-run Mongo inspection requires every expected owner/id exactly once, completed with one attempt.',
        durability: 'Existing service write concern is majority on a standalone MongoDB process. This measures acknowledged persistence, not replica failover or crash durability.',
        exclusions: 'No browser, Workers/D1 gateway, external network/TLS, rate-limit saturation, cold start, production deployment or independent Python replay is measured.' },
      aggregate: { completedAndVerified: completed, failed: trials.reduce((n, t) => n + t.summary.failed, 0), durationMs: totalMs,
        verifiedJobsPerSecond: completed / (totalMs / 1000), verifiedResult: distribution(trials.flatMap(t => t.samples.filter(s => s.ok).map(s => s.totalMs))) },
      repetitions: trials.map(trial => ({ ...trial, samples: undefined, samplesFile: `trial-${trial.repetition}.json` })) };
    await writeFile(join(options.output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(`Saved verified report: ${relative(root, join(options.output, 'report.json'))}`);
    return report;
  } catch (e) {
    await writeFile(join(options.output, 'failure.json'), JSON.stringify({ valid: false, error: e instanceof Error ? e.message : 'Benchmark failed', completedTrials: trials.length }, null, 2) + '\n', { flag: 'wx' });
    throw e;
  } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await benchmark(parseOptions(process.argv.slice(2))); }
  catch (e) { console.error(e instanceof Error ? e.message : 'Benchmark failed.'); process.exitCode = 1; }
}
