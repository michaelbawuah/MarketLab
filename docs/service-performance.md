# Research service performance

On September 26, 2026, the standalone Node/MongoDB service completed and verified
3,000 fresh research jobs across three repetitions at **39.96 jobs/second** in
aggregate. Combined client-observed p99 was **319.77 ms**. This is a local,
closed-loop baseline for the workload below; production capacity remains
unmeasured. The website's Workers/D1 gateway was outside this benchmark.

## Measured results

Each repetition used a fresh MongoDB process/database, a separate Node service
process, two calculation workers and eight concurrent clients. Thirty-two warm-up
jobs preceded each measured run and are excluded from these results.

| Trial | Verified jobs | Failures | Duration | Jobs/s | p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1,000 | 0 | 24.93 s | 40.11 | 196.40 ms | 271.56 ms | 317.20 ms | 341.53 ms |
| 2 | 1,000 | 0 | 24.98 s | 40.04 | 195.64 ms | 278.26 ms | 308.02 ms | 362.93 ms |
| 3 | 1,000 | 0 | 25.16 s | 39.74 | 199.10 ms | 276.45 ms | 331.10 ms | 402.52 ms |
| Combined samples | 3,000 | 0 | 75.07 s | 39.96 | 196.96 ms | 276.56 ms | 319.77 ms | 402.52 ms |

P99 is the nearest-rank 99th percentile of elapsed time from beginning submission
signing through receiving, parsing and verifying the full saved result. In the
combined sample, 99% of jobs finished within approximately 320 ms. The combined
percentile was recomputed from all 3,000 samples, not averaged from trial
percentiles. Warm-up and process startup are excluded.

Throughput divides verified measured jobs by the interval from starting the first
client until all measured clients finish, including result checks and the final
drain. All measured submissions returned 202, all result retrievals returned 200,
and all jobs had one attempt. After each run, a separate database audit found
exactly the expected 1,000 completed owner/job pairs.

## Workload and timing

- Two fictional USD instruments with 500 observations each, generated from fixed
  integer seeds. No exchange calendar or market-data provider is involved.
- One strategy and two reference holdings across full, earlier and later
  evaluation periods. Forty observations precede evaluation, leaving 460 full,
  310 earlier and 150 later observations. No corporate actions occur.
- Eight equally represented profiles: SMA windows 5, 10, 20 and 40, each with
  either zero costs or 5 bps fees plus 3 bps slippage. Starting cash is $10,000.
  Full-period strategy trade counts range from 35 to 133.
- HMAC-signed HTTP submission, source hash validation, nonce persistence, MongoDB
  queue insertion/claim, worker-thread validation and exact TypeScript accounting,
  nine native risk comparison groups, fenced result persistence, status polling
  and full-result retrieval. Canonical analysis JSON is roughly 274–302 kB; the
  complete HTTP result also includes snapshots and a confidence certificate.
- Each job's name produces a fresh snapshot ID. Each trial represents 40
  fictional owners with 25 measured jobs each, preserving the normal 30-job
  quota. Authentication, validation and native checks remain enabled.

Each of eight clients has one job in flight and begins another only after
verifying the previous result. It polls immediately after submission, then waits
50 ms after each nonterminal response. Monotonic client timings include polling
detection, HTTP, queueing, calculations, storage, transfer and client validation.
Fixture construction and process startup are outside the timed interval.

This closed-loop load does not maintain a fixed external arrival rate when
responses slow down. It cannot establish saturation capacity or an open-loop
latency SLO. No server-only latency is inferred by subtracting polling time.

## Correctness gates

The driver computes expected outputs for all eight profiles before timing. Every
retrieved result must match frozen-input and canonical-analysis SHA-256 hashes,
report completion with one attempt, and carry the configured verification receipt.
The service performs the actual native comparisons. A separate Mongo connection
then verifies every expected owner/ID exactly once. A mismatch, timeout, failed
job or unstarted job invalidates the trial and makes the command exit unsuccessfully.
Raw failed samples remain in the evidence.

These checks establish transport, execution and persistence relative to the
canonical engine. Canonical replay uses the same TypeScript implementation;
independent financial-model verification is a separate layer. The C++ check
provides independent risk arithmetic. No new Python financial replay is claimed.

Five new unit cases check nearest-rank tail calculations, failed/undispatched
job accounting, deterministic workload/owner limits, corrupted result rejection
and bounded command options. All 98 unit tests, type checking and lint pass.
A separate Python statistics audit recomputed rates and percentiles from raw
samples and verified every recorded source hash.

## Environment and limits

| Property | Recorded value |
| --- | --- |
| Runtime | Node v24.19.0, Linux x64, kernel 6.18.44 |
| Database | MongoDB 8.0.17, standalone WiredTiger, 256 MiB cache |
| CPU model | AMD EPYC 9V74 80-Core Processor, shared runtime |
| CPU allowance | cgroup `800000 100000` (8 CPU-equivalents); 9 visible logical CPUs |
| Memory limit | cgroup 8 GiB |
| Calculation concurrency | 2 worker threads, `cpp-verify` |
| Load generator | Separate process, 8 clients, same machine |
| Communication | Loopback HTTP and loopback MongoDB |

Peak sampled service RSS was approximately 460–472 MiB. The report includes
service CPU time, RSS and event-loop delay plus the driver's CPU and peak RSS.
Service memory excludes MongoDB and the driver; driver peak RSS is cumulative
across repetitions. Event-loop delay uses 10 ms resolution and is a diagnostic
separate from job latency.

The service's existing `w: majority` operates on a standalone database here. These
results measure acknowledged persistence without proving replicated durability
or failover. Process recovery has [separate evidence](reliability-evidence.md).

The shared machine, synthetic workload, warm-up, polling, owner quota occupancy
and local network affect results. Three short repetitions do not establish
long-duration stability, rare-tail behavior or production p99. No browser,
Workers/D1 gateway, TLS, external network or cold start is measured. Staging
activation remains a later milestone.

## Reproduce

Use Node 24, locked pnpm dependencies, an installed MongoDB executable and a C++17
compiler. The runner creates its own loopback-only MongoDB process and temporary
database directory. It ignores existing database URIs/credentials and production
records, and cleans up its own processes/data afterward.

```sh
pnpm install --frozen-lockfile
pnpm native:build
MONGOD_BIN=/path/to/mongod pnpm bench:service --output /tmp/marketlab-service-run
```

The output directory must not exist. Defaults match the recorded workload:
1,000 jobs × 3 repetitions, 500 observations, 32 warm-up jobs, 8 clients, 2 workers,
50 ms polling and native verification. Options: `--jobs`, `--repetitions`,
`--observations`, `--warmup`, `--concurrency`, `--workers`, `--pollMs` and `--mode`.
`--mode typescript` explicitly removes native verification work and is a different
workload. Do not compare its results as the same configuration.

For a short execution check:

```sh
MONGOD_BIN=/path/to/mongod pnpm bench:service \
  --output /tmp/marketlab-service-smoke --jobs 24 --repetitions 1 --warmup 8
```

The initial 24-job smoke check passed; its timings are excluded from the table.
No tests, builds or other deliberate CPU-heavy tasks ran alongside the recorded
repetitions. The shared execution environment may still have contention.

## Evidence

- [Full report](evidence/service-load-2026-09-26/report.json): definitions,
  environment, profiles, resource diagnostics and trial/aggregate statistics.
- Raw samples: [trial 1](evidence/service-load-2026-09-26/trial-1.json),
  [trial 2](evidence/service-load-2026-09-26/trial-2.json),
  [trial 3](evidence/service-load-2026-09-26/trial-3.json).
- [Frozen workload](evidence/service-load-2026-09-26/workload.json) and
  [source/environment manifest](evidence/service-load-2026-09-26/manifest.json).
  The base commit predates the runner; exact file/native-binary hashes identify
  the measured source, which was uncommitted at run time.
- [Statistics audit](evidence/service-load-2026-09-26/statistics-audit.txt),
  [execution log](evidence/service-load-2026-09-26/execution.txt) and
  [unit output](evidence/service-load-unit-tests.txt).

No GitHub push or new remote CI run accompanies this measurement. Milestones 6
and 7 are ready for the next batch, with the checkpoint after milestone 8 or 9.
The private website runtime is unchanged by this service tooling.
