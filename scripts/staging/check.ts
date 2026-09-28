/** Run inside the deployed image. No public crash endpoint or production hook. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { JobStore, type Job } from '../../services/research/store.ts';
import { ComputePool } from '../../services/research/pool.ts';
import { JobRunner } from '../../services/research/runner.ts';
import { configFromEnv } from '../../services/research/server.ts';
import { researchFixture } from '../../tests/fixtures/research.ts';
import { analyzeResearch, researchFingerprint } from '../../lib/finance/research.ts';
import { signResearchRequest } from '../../lib/research-signing.ts';
import { REPLAY_VERSION,replayReportJSON,replayDigest,checkedReplayReceipt } from '../../lib/finance/replay-receipt.ts';

let phase = 'configuration';
async function run() {
const [scope, output, ...extra] = process.argv.slice(2);
if (!['ci', 'staging'].includes(scope) || !output || extra.length || process.env.RESEARCH_DEPLOYMENT_STAGE !== scope) throw new Error('Usage: check.ts ci|staging NEW_RECEIPT.json; RESEARCH_DEPLOYMENT_STAGE must match.');
const config = configFromEnv();
assert.equal(config.mode, 'cpp-verify', 'Acceptance requires the native verification engine.');
const origin = new URL(process.env.RESEARCH_ACCEPTANCE_URL ?? `http://127.0.0.1:${config.port}`);
if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('Use a service HTTPS origin or local loopback HTTP.');
if (scope === 'staging' && origin.protocol !== 'https:') throw new Error('Staging acceptance requires the public HTTPS origin.');
assert.match(process.env.RESEARCH_BUILD_REVISION ?? '', /^[a-f0-9]{40}$/, 'Build with the exact source commit.');
const runId = randomUUID().replaceAll('-', ''), owner = `acceptance:${runId}`, prefix = `acceptance_${runId}_`, leaseMs = scope === 'staging' ? 60000 : 1000;
const main = new JobStore(config.uri, config.database), observer = new JobStore(config.uri, config.database, prefix);
const stores: JobStore[] = [], runners: JobRunner[] = [];
const started = new Date().toISOString(), startClock = performance.now(), snapshot = await researchFixture(), expected = analyzeResearch(snapshot), id = await researchFingerprint(snapshot);
let child: ReturnType<typeof fork> | undefined, childExited: Promise<NodeJS.Signals | null> | undefined, result: Record<string, unknown> | undefined;
const checks: string[] = [];
async function call(method: string, target: string, payload?: unknown, signedOwner = owner, expectedStatus = 200) {
  const raw = payload === undefined ? '' : JSON.stringify(payload), headers = await signResearchRequest(config.secret, signedOwner, method, target, raw);
  const response = await fetch(origin.origin + target, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: raw || undefined, redirect: 'error', signal: AbortSignal.timeout(10000) });
  const body = await response.json() as { job?: { id: string; status: string; analysis: unknown; verification?: { comparisons: number } } };
  assert.equal(response.status, expectedStatus, `Unexpected status for ${method} ${target}`);
  return body.job;
}
try {
  // The HTTP smoke uses its own random owner; cleanup targets that owner only.
  phase = 'signed HTTP and native verification';
  await main.ping();
  const health = await fetch(origin.origin + '/healthz', { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ready', service: 'marketlab-research', engine: 'cpp-verify', pythonReplay:REPLAY_VERSION });
  const anonymous = await fetch(origin.origin + '/v1/jobs', { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(anonymous.status, 401); await anonymous.arrayBuffer(); checks.push('readiness-and-unsigned-rejection');
  await call('POST', '/v1/jobs', { snapshot }, owner, 202);
  let httpJob;
  const httpDeadline = performance.now() + 60000;
  do { httpJob = await call('GET', `/v1/jobs/${id}`); if (httpJob?.status === 'completed' || httpJob?.status === 'failed') break; await delay(250); } while (performance.now() < httpDeadline);
  assert.equal(httpJob?.status, 'completed'); assert.deepEqual(httpJob?.analysis, expected); assert.equal(httpJob?.verification?.comparisons, 9);
  await call('GET', `/v1/jobs/${id}`, undefined, owner + ':other', 404);
  const replay = await call('POST', '/v1/jobs', { snapshot }); assert.equal(replay?.id, id);
  assert.equal(await main.jobs.countDocuments({ owner }), 1); checks.push('signed-submit-native-parity-owner-isolation-and-replay');
  phase='independent Python replay';
  const reportRaw=replayReportJSON({id,snapshot,analysis:expected});
  const pythonHeaders=await signResearchRequest(config.secret,owner,'POST','/v1/replay',reportRaw);
  const pythonResponse=await fetch(origin.origin+'/v1/replay',{method:'POST',headers:{...pythonHeaders,'Content-Type':'application/json'},body:reportRaw,redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(pythonResponse.status,200);
  const pythonReceipt=checkedReplayReceipt((await pythonResponse.json() as {receipt:unknown}).receipt,id,await replayDigest(reportRaw));
  assert.ok(pythonReceipt);assert.equal(pythonReceipt.simulations,9);checks.push('independent-python-replay-bound-to-full-report');
  const tampered=structuredClone(expected);tampered.full.strategyRisk.volatilityPct=999;
  await call('POST','/v1/replay',JSON.parse(replayReportJSON({id,snapshot,analysis:tampered})),owner,422);checks.push('python-rejects-altered-result');

  // A separate collection pair prevents the live server from claiming the
  // controlled crash fixture or participating in its shortened CI lease.
  phase = 'controlled worker crash';
  await observer.initialize();
  const submitted = await observer.submit(owner, snapshot);
  child = fork(new URL('./crash-runner.ts', import.meta.url), [prefix, String(leaseMs)], { execArgv: ['--experimental-strip-types'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: process.env });
  childExited = new Promise(resolve => child!.once('exit', (_code, signal) => resolve(signal)));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Acceptance child did not reach the calculation barrier.')), 30000);
    child!.once('error', () => { clearTimeout(timer); reject(new Error('Acceptance child failed to start.')); });
    child!.once('exit', () => { clearTimeout(timer); reject(new Error('Acceptance child exited before its barrier.')); });
    child!.on('message', message => { if ((message as { type?: string }).type === 'calculated-before-finalization') { clearTimeout(timer); resolve(); } });
  });
  const stale = (await observer.get(owner, submitted.id))!;
  assert.equal(stale.status, 'running'); assert.equal(stale.attempts, 1); assert.equal(stale.result, undefined);
  assert.ok(child.kill('SIGKILL')); assert.equal(await childExited, 'SIGKILL');
  phase = 'lease recovery and durable finalization';
  let finalizations = 0;
  for (let i = 0; i < 2; i++) {
    const store = new JobStore(config.uri, config.database, prefix); stores.push(store); await store.initialize();
    const complete = store.complete.bind(store);
    store.complete = async (...args) => { const committed = await complete(...args); if (committed) finalizations++; return committed; };
    const runner = new JobRunner(store, new ComputePool(1, 'cpp-verify'), leaseMs); runners.push(runner); runner.start();
  }
  let saved: Job | null = null;
  const recoveryDeadline = performance.now() + leaseMs + 30000;
  do { saved = await observer.get(owner, id); if (saved?.status === 'completed' || saved?.status === 'failed') break; await delay(100); } while (performance.now() < recoveryDeadline);
  assert.equal(saved?.status, 'completed'); assert.equal(saved?.attempts, 2); assert.deepEqual(JSON.parse(saved!.result!), expected); assert.equal(saved?.verification?.comparisons, 9);
  await Promise.all(runners.map(runner => runner.close()));
  assert.equal(finalizations, 1); assert.equal(await observer.jobs.countDocuments({ owner }), 1);
  assert.equal(await observer.complete(stale, expected, saved!.verification!), false);
  assert.equal(await observer.heartbeat(stale, leaseMs), false);
  await observer.fail(stale, 'stale', 'Must not replace the saved result.', true);
  const reopened = new JobStore(config.uri, config.database, prefix);
  try { const durable = await reopened.get(owner, id); assert.equal(durable?.status, 'completed'); assert.deepEqual(JSON.parse(durable!.result!), expected); } finally { await reopened.close(); }
  checks.push('sigkill-after-calculation', 'natural-database-lease-recovery', 'two-competing-runners', 'one-durable-result', 'stale-token-rejection', 'fresh-connection-replay');
  const sources = ['services/research/server.ts', 'services/research/store.ts', 'services/research/runner.ts', 'services/research/pool.ts', 'services/research/python-replay.ts', 'verification/python/verify_research.py', 'lib/finance/research.ts', 'native/build/marketlab_risk.node'];
  const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash('sha256').update(await readFile(new URL('../../' + file, import.meta.url))).digest('hex')])));
  result = { format: 'marketlab-staging-acceptance-v1', scope, started, finished: new Date().toISOString(), elapsedMs: Math.round(performance.now() - startClock), serviceOrigin: origin.origin, publicHttpsChecked: origin.protocol === 'https:', revision: process.env.RESEARCH_BUILD_REVISION ?? 'unknown', node: process.version, leaseMs, attempts: saved!.attempts, acceptedFinalizations: finalizations, storedResults: 1, nativeComparisons: 9, pythonReceipt, checks, sourceHashes };
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await childExited; }
  await Promise.all(runners.map(runner => runner.close()));
  await Promise.all(stores.map(store => store.close()));
  try {
    // Only this command's random owner and collection names can be removed.
    const cleanup = await Promise.allSettled([
      main.jobs.deleteMany({ owner }),
      main.nonces.deleteMany({ owner: { $in: [owner, owner + ':other'] } }),
      ...[observer.jobs.collectionName, observer.nonces.collectionName].map(async collection => {
        assert.ok(collection.startsWith(prefix));
        const db = observer.client.db(config.database);
        if (await db.listCollections({ name: collection }, { nameOnly: true }).hasNext()) await db.dropCollection(collection);
      }),
    ]);
    if (cleanup.some(item => item.status === 'rejected')) { phase = 'test-record cleanup'; throw new Error('Acceptance cleanup failed.'); }
  } finally { await observer.close(); await main.close(); }
}
phase = 'receipt write';
await writeFile(output, JSON.stringify({ ...result, cleanup: 'only-this-run-test-records-removed' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ scope, passed: true, receipt: output, checks: checks.length, leaseMs, acceptedFinalizations: 1, storedResults: 1 }));
}
await run().catch(() => {
  // Driver errors can contain credentials; emit only a fixed phase label.
  console.error(`Research acceptance failed during ${phase}. No passing receipt was written.`);
  process.exitCode = 1;
});
