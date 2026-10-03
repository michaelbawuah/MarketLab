# Bounded research admission

October 3, 2026 extension for the Quant SWE portfolio. The background service
previously limited each workspace to 30 saved reports but had no global limit on
unfinished work. Under fixed external traffic, a growing queue could consume
memory/storage and turn a busy service into long, unexplained waits.

## Behavior and mechanism

The default is **64 unfinished jobs globally and 4 per owner**, including queued
and running jobs. A workspace still has its separate 30 saved-report quota.
A new request beyond the owner limit receives HTTP 429; global saturation returns
503. Both carry `Retry-After: 2`, a stable capacity code and a human-readable
message. The consumer gateway retains the saved experiment and explains when to
retry. There is no automatic retry loop or promise of when a calculation finishes.
An identical owner/input fingerprint returns its existing job even at capacity.

Each active job owns a bounded global slot and a bounded owner slot. Strict Mongo
schema validation requires those fields for queued/running records, and partial
unique indexes prevent two active records claiming either slot. The fingerprint,
lifetime quota and both active capacities are reserved in one atomic document
write. Occupancy reads choose candidates; they are not the source of correctness.
Slot collisions retry a bounded number of times. No separate counter or permit
collection can drift from the durable job state.

Completion, permanent failure and exhausted attempts release both slots in the
same lease-fenced update that makes the job terminal. Retryable failures and
expired-lease reclamation retain their slots. A stale worker cannot finish a
replacement worker's job or free its capacity. Workers still claim in FIFO order;
per-owner admission limits do not promise round-robin scheduling or CPU fairness.

Database-clock admitted/first-claimed/final-attempt-start/completed timestamps
separate initial queue wait, total residence and the last attempt's wall time.
The last duration includes IPC, worker work and persistence; it is not pure kernel
latency. Allocation slots remain internal and are excluded from list/detail APIs.

Operator settings `RESEARCH_ACTIVE_LIMIT` (1–256) and
`RESEARCH_OWNER_ACTIVE_LIMIT` (1–30, no larger than the global limit) must match
the persisted schema. Changing them requires an explicit migration, never a silent
reinterpretation of existing jobs. The product interface exposes neither setting.

## Existing database migration

The ordinary runtime Mongo account remains `readWrite`. A legacy validator needs
one operator `collMod` invocation, using a temporary privileged connection.
Run one approved migration with one agreed limit set; do not run competing
operator migrations with different limits. `JobStore.initialize(operatorUri)`
uses that connection only for the schema change and closes it afterward.

Before the barrier, projected, bounded occupancy reads reject an oversized legacy
queue without deleting records or changing its validator. Strict/error validation
then blocks old code from creating slotless jobs. Unique indexes are installed
before atomic conditional backfill. Same-limit initializers or an interrupted
migration can safely resume repair; terminal records are never resurrected.
Startup verifies every active record has slots and rechecks the persisted schema.
Unsafe `warn`/`moderate` validation or a different configured schema fails startup.
If a final old request races before the barrier and puts the queue over capacity,
startup fails closed; preserve/drain the acknowledged work before retrying.

For staging, `scripts/staging/upgrade.ts` constructs the temporary operator
connection from referenced Mongo admin credentials, removes them from the child
process environment, migrates, starts the ordinary service and runs the existing
signed/native/Python/crash acceptance. After success, clear those two credential
references and restore `services/research/server.ts` as the start command. Confirm
ordinary-role readiness on the resulting deployment. Mongo stays private; there
is no new endpoint, replica, paid integration or scale change.

## Verification and measurement

The real authenticated Mongo tests cover concurrent admission through three
connections, exact bounds, no partial records on rejection, replay while full,
invalid/missing allocation fields, safe public projection, retry retention,
stale-worker fences, terminal release, exhausted attempts, HTTP status/headers,
operator-only migration, same-limit repair after interruption, and unsafe
validation modes. The existing lifetime quota remains independently tested. A deterministic
startup interleaving repairs the same row between its first read and slot
selection; the regression fails on the initial implementation and passes after
re-reading the repaired row. Both outputs are retained in `docs/evidence/`.

The new fixed-arrival runner uses the same eight deterministic 500-observation
profiles as the earlier [closed-loop baseline](service-performance.md). Arrivals
occur at `i / rate` on a monotonic clock, independently of response/completion.
Driver dispatch and polling concurrency are bounded. Missed arrivals are counted,
not delayed in an unbounded catch-up queue. Every accepted job must match frozen
input/result hashes and nine native comparisons, and a fresh Mongo audit checks
one completed durable record per acknowledged owner/ID. Transport ambiguity,
unexpected rejection, invalid output, failure or unresolved jobs invalidate the
trial. The rejection population is explicitly separate from successful latency.

Queue/RSS samples are diagnostics at 250 ms intervals, not a proof that transient
overshoot is impossible. Database constraints and concurrent integration tests
establish the bound. Service RSS is sampled over IPC and driver RSS locally. Mongo resident memory
is sampled through serverStatus when available; this managed runtime cannot
provide it (Mongo error 13538), so Mongo RSS is explicitly unknown, never zero. The recovery
trial stops arrivals, waits for submission acknowledgements, kills the real service
with SIGKILL, keeps Mongo and restarts unchanged configuration. Its 60-second leases
expire naturally; calculations may retry, with one durable fenced result.

```sh
pnpm native:build
MONGOD_BIN=/path/to/mongod pnpm bench:arrivals --output /tmp/marketlab-arrivals
MONGOD_BIN=/path/to/mongod pnpm test:service:local --ci
```

Default matrix: 20/s baseline and 80/s overload for 15 seconds, three repetitions,
32 excluded warm-up jobs, two native-verification workers, 64/4 admission, eight
pollers and at most 64 submission requests in flight. One additional overload
recovery trial permits 120 seconds to drain. Output directories must be new;
failed trials and samples are retained. These are short shared-machine local
experiments, not production capacity, HFT latency, replicated database failover,
a browser/gateway/TLS test, independent Python replay or real-user adoption.
The old runner explicitly uses a 64/30 compatibility admission profile; its
September 26 evidence is preserved and is not reclassified as fixed-arrival data.

## Observed October 3 results

The final baseline/overload/recovery matrix passed every gate. Across 2,700
fixed-schedule arrivals: **1,362 were admitted and verified**, and **1,338 received
intentional capacity rejection**. There were zero driver drops, unexpected
rejections, ambiguous acknowledgements, failed/invalid results or unresolved jobs.

| Trial | Offered | Verified | Capacity rejected | Sampled active peak | Scheduled-to-verified p99 | Initial queue p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline-1 | 300 | 300 | 0 | 1 | 0.153 s | 0.005 s |
| overload-1 | 1200 | 529 | 671 | 64 | 7.183 s | 7.047 s |
| recovery | 1200 | 533 | 667 | 64 | 7.643 s | 7.267 s |

The baseline accepted all 300 requests at 20/s. The 80/s overload run reached
the configured 64-job bound and drained every accepted job. Busy requests are
counted separately from successful-result latency. Bounded admission limits
accumulation; accepted reports can still take several seconds during saturation.
The runner's periodic worker refill is a candidate for subsequent profiling,
not a claimed optimization in this release.

The final recovery trial stopped arrivals and paused the local helper after real
calculation but before finalization, then SIGKILLed the entire service with
63 unfinished jobs, including 2 running jobs. The production image excludes this helper;
there is no public crash/control endpoint. Restart used the same service settings
and database, without the barrier. 2 jobs required a second attempt. Their scheduled-to-verified
maximum was **62.048 seconds**; restart-to-last-recovered observation was
**59.894 seconds**. These interrupted jobs can fall outside aggregate p99;
the separate population exposes the natural 60-second lease delay. Every
acknowledged job had one durable fenced result, without manual requeue.

Service and driver sampled peak RSS, in MiB, were:

| Trial | Service | Driver | Mongo |
| --- | ---: | ---: | --- |
| baseline-1 | 275.9 | 225.0 | unavailable |
| overload-1 | 419.0 | 427.2 | unavailable |
| recovery | 427.1 | 463.8 | unavailable |

### Retained attempts and limitations

The intended first matrix had three repetitions. Five trials passed; its third
overload trial had three >50 ms driver misses and was rejected as a timing run.
A follow-up baseline/overload pair passed, but its crash landed in a brief worker
idle gap (62 queued, zero running), correctly failing the interrupted-work gate.
The final one-repetition matrix uses an explicit after-calculation crash barrier.
These attempts are retained and not silently pooled into the final latency report.

| Earlier final-code trial | Offered | Verified | Capacity rejected | Driver drops | Acceptance |
| --- | ---: | ---: | ---: | ---: | --- |
| fixed-arrival-attempt / baseline-1 | 300 | 300 | 0 | 0 | passed |
| fixed-arrival-attempt / baseline-2 | 300 | 300 | 0 | 0 | passed |
| fixed-arrival-attempt / baseline-3 | 300 | 300 | 0 | 0 | passed |
| fixed-arrival-attempt / overload-1 | 1200 | 318 | 882 | 0 | passed |
| fixed-arrival-attempt / overload-2 | 1200 | 463 | 737 | 0 | passed |
| fixed-arrival-attempt / overload-3 | 1200 | 398 | 799 | 3 | invalid; retained |
| fixed-arrival-recovery-idle / baseline-1 | 300 | 300 | 0 | 0 | passed |
| fixed-arrival-recovery-idle / overload-1 | 1200 | 531 | 669 | 0 | passed |
| fixed-arrival-recovery-idle / recovery | 1200 | 490 | 710 | 0 | invalid; retained |

The initial pre-fix outcome run and a failed Mongo resource-sampling attempt are
also retained under labeled preliminary/failure directories. Their memory values
are not used. Each attempt has its own source manifest; no speedup or pooled
performance claim across changed fixture versions is made.

No deliberate build/test workload ran alongside timed trials. Fixture/startup
and 32 warm-up jobs per trial were excluded. Source preparation ran during one
follow-up; the shared execution environment remains a limitation. Exact source
and native binary hashes identify the measured uncommitted tree, rather than
asserting that the native base commit contains the changes. Python recomputed
outcomes and nearest-rank p99 and verified every final source hash.

Evidence: [final report](evidence/fixed-arrival-2026-10-03/report.json),
[manifest](evidence/fixed-arrival-2026-10-03/manifest.json),
[frozen workload](evidence/fixed-arrival-2026-10-03/workload.json),
[raw recovery](evidence/fixed-arrival-2026-10-03/recovery.json),
[statistics audit](evidence/fixed-arrival-2026-10-03/statistics-audit.txt),
[three-repetition attempt](evidence/fixed-arrival-attempt-2026-10-03/README.md),
and [idle-gap crash attempt](evidence/fixed-arrival-recovery-idle-2026-10-03/README.md).

## Release checks

The authenticated full local gate passed: type checking/lint, 150 unit tests,
24 integration tests, four native cases, 11 Python verifier tests, 67,044 fresh
TypeScript/Python scalar comparisons, production build and 435 built-Worker
checks. [Full output](evidence/overload-verification-2026-10-03.txt) is distinct
from [the initial failure](evidence/overload-verification-initial-failure-2026-10-03.txt).
The [failing-before](evidence/admission-race-failing-before.txt) and
[passing-after](evidence/admission-race-passing-after.txt) startup regression
retain the exact controlled interleaving. Subsequent benchmark fixture edits
passed type checking/lint and the actual final load/recovery matrix; the runtime
store and financial code were unchanged.

Both code-release GitHub gates passed for `5910663861173bd86d48767af1fa85ad566422e6`:
[Engineering verification](https://github.com/michaelbawuah/MarketLab/actions/runs/37145596051)
and [Research container acceptance](https://github.com/michaelbawuah/MarketLab/actions/runs/37145596063).
The latter exercises authenticated restricted-role startup, signed HTTP,
native/Python replay, real process recovery and isolated 64/4 capacity checks.
The hosted app gateway update was published successfully with environment
revision 8. These results do not establish hosted activation of the new queue.

### Hosted activation blocked

Automatic approval review rejected referencing Mongo root credentials in the
research environment, because that would persist broad administrator access
beyond the user's explicit authorization. No migration credentials were written.
The branch update was initially triggered before that rejection was checked;
the ordinary start command was immediately restored and the prior successful
worker build redeployed. Deployment `95f19d0a-a6c6-4b34-ae9a-f657a2b8ddd6`
succeeded; logs confirm the normal native-verification service listening.
No pending configuration changes or migration variables remain.

**The hosted worker still runs its prior build; new admission bounds are not
active there.** The prepared operator wrapper and exact 64/4 schema are reviewable,
but running it with temporary administrator references requires explicit approval.
After migration/acceptance, clear those references, restore the ordinary start
command and verify restricted-role readiness. Do not infer that publishing source,
container acceptance or the app gateway migrated the live database.

The three real participant pilot sessions and fresh-account production browser
acceptance remain outstanding; synthetic load jobs are not users or adoption.
