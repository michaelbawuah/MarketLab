export function distribution(samples: number[]) {
  if (!samples.length) return null;
  if (samples.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Timing samples must be finite and nonnegative.');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { count: sorted.length, minMs: sorted[0], meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted.at(-1)! };
}

export type JobSample = { index: number; profile: number; id: string; startMs: number; submitMs?: number; completedObservedMs?: number; totalMs: number; polls: number; resultBytes?: number; ok: boolean; error?: string };
export function summarizeSamples(samples: JobSample[], planned: number, durationMs: number) {
  if (!(durationMs > 0) || !Number.isFinite(durationMs) || !Number.isSafeInteger(planned) || planned < 1 || samples.length > planned || new Set(samples.map(s => s.index)).size !== samples.length) throw new Error('Invalid benchmark accounting.');
  const successful = samples.filter(s => s.ok), failed = samples.filter(s => !s.ok);
  if (successful.some(s => s.submitMs === undefined || s.completedObservedMs === undefined || s.submitMs < 0 || s.completedObservedMs < s.submitMs || s.totalMs < s.completedObservedMs || s.startMs + s.totalMs > durationMs + 1)) throw new Error('Invalid successful timing boundaries.');
  return { planned, started: samples.length, completedAndVerified: successful.length, failed: failed.length,
    notStarted: planned - samples.length, valid: successful.length === planned,
    durationMs, verifiedJobsPerSecond: successful.length / (durationMs / 1000),
    latencyPopulation: 'Successful jobs only; failures and undispatched jobs are counted separately. No failed sample is silently discarded.',
    submit: distribution(successful.map(s => s.submitMs!)), completionObserved: distribution(successful.map(s => s.completedObservedMs!)),
    verifiedResult: distribution(successful.map(s => s.totalMs)), failedElapsed: distribution(failed.map(s => s.totalMs)),
    statusRequests: samples.reduce((n, s) => n + s.polls, 0), errors: failed.map(s => ({ index: s.index, error: s.error })) };
}
