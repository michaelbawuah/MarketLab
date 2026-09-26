# Reliability milestone evidence — September 26, 2026

This records the first engineering work from the adopted
[roadmap](engineering-roadmap.md). Results are from actual local processes,
not mocked MongoDB, simulated test passes or remote CI.

## Environment and scope

- Baseline source: `30b428b62270ec78d13b139c328eb3820cb99b8c`.
- Ubuntu 24.04 x86-64; Node 24.19.0; pnpm 11.25.0; Python 3.12.14;
  GCC C++ 13.3.0; MongoDB server 8.0.17; installed MongoDB driver 7.6.0.
- Official MongoDB Ubuntu 24.04 archive SHA-256:
  `fe7bccea2ac1eed16867e9ae5a60481455ee30796f285fe67d0d02a6c2abbdda`.
- MongoDB binds to an ephemeral loopback port and uses a temporary data directory.
  Tests create/drop only their own randomly named `marketlab_test_...` databases.
- The native addon is built locally. All research inputs are synthetic fixtures.
  No hosted records, user data, paid services or real investment decisions are used.

## 1. Real concurrency defect: host-clock lease ownership

**Problem.** The old store used `new Date()` on the calling application host to
claim, expire, renew and finalize jobs. A second host one hour ahead could reclaim
the first worker's live lease, consuming another attempt. A fast worker could
also grant itself an hour of unintended ownership, and a slow worker could
finalize a lease that had already expired according to database time. The unique
job ID did not correct those ownership decisions.

**Failing-before evidence.** Three regression cases ran against the unchanged
baseline store and a real MongoDB process. All three failed with assertions about
the actual stored/returned state. See [original output](evidence/lease-clock-before.txt).
That output predates the test-directory reorganization; the cases now live in
`tests/integration/lease-clock.test.ts`.

| Case | Baseline result | Fixed result |
| --- | --- | --- |
| Fast competing host asks to reclaim a live lease | Incorrectly claims it | Returns no job; original attempt can finish |
| Fast host claims/renews work | Extends expiry by its one-hour skew | Expiry follows the database clock |
| Slow host tries to finalize expired work | Incorrectly accepts completion | Rejects completion, heartbeat and requeue; a fresh claim can finish |

**Mechanism.** `services/research/store.ts` uses MongoDB's `$$NOW` for lease
comparisons and update pipelines. One atomic document update matches the current
token, running state and unexpired database lease before finalizing. Claiming
rotates the token and increments the bounded attempt counter. Renewal reports
matched ownership even if same-millisecond values produce no document change.
Pipeline values from calculation/error data use `$literal`, so dollar-prefixed
text stays data.

**Passing-after evidence.** The same three cases pass after the fix; see
[output](evidence/lease-clock-after.txt). A fourth boundary case added afterward
checks literal error/verification values and passes in the complete gate.

Focused reproduction on the current source:

```sh
MONGOD_BIN=/path/to/mongod pnpm test:service:local tests/integration/lease-clock.test.ts
```

To reproduce the original failure without overwriting working source, create a
separate checkout of the baseline and copy in only the new test/launcher:

```sh
git worktree add --detach ../marketlab-clock-baseline 30b428b62270ec78d13b139c328eb3820cb99b8c
mkdir -p ../marketlab-clock-baseline/tests/integration
cp tests/integration/lease-clock.test.ts ../marketlab-clock-baseline/tests/integration/
cp scripts/test-service-local.mjs ../marketlab-clock-baseline/scripts/
cd ../marketlab-clock-baseline
pnpm install --frozen-lockfile
MONGOD_BIN=/path/to/mongod pnpm test:service:local --test-name-pattern='fast competing host|skewed claim|slow stale host' tests/integration/lease-clock.test.ts
```

Expected baseline outcome: nonzero exit, three assertion failures. The test-only
Date mock affects the client process; MongoDB runs separately with its real clock.

## 2. Process-kill recovery with one durable result

`tests/integration/crash-recovery.test.ts` runs this sequence:

1. Submit a frozen snapshot to a real MongoDB store.
2. Fork a process running the production `JobRunner` and `ComputePool`.
3. Inject a test worker through a factory. It validates and calculates using the
   canonical engine, then blocks before returning the unsaved result.
4. Confirm the job is running at attempt one, with no result, and send **SIGKILL**
   to the process. Observe termination by SIGKILL, so no graceful cleanup runs.
5. Start two independent replacement stores/runners using normal production
   workers with C++ verification. Let the database lease expire naturally.
6. Observe completion at attempt two, exactly one accepted finalization and
   exactly one stored owner result. Compare every result field with the reference.
7. Reject completion/heartbeat/requeue from the old token and read the unchanged
   completed result through a fresh database connection.

The test passed, including all nine native risk checks. See
[crash output](evidence/crash-recovery.txt) and the final
[full gate](evidence/local-verification-gate.txt). The latter runs the test after
test-directory reorganization and all code changes.

```sh
pnpm native:build
MONGOD_BIN=/path/to/mongod pnpm test:service:local tests/integration/crash-recovery.test.ts
```

The fixture deliberately kills the **calculated-but-not-saved** window. This is
at-least-once computation with one fenced durable finalization for this test;
it is not exactly-once execution. Attempts remain bounded to three, so repeated
crashes may terminate in a recorded failure instead of eventual success.

## 3. Layered verification gate

The single local command was:

```sh
MONGOD_BIN=/path/to/mongod pnpm test:service:local --ci
```

| Check | Observed result |
| --- | --- |
| TypeScript checking | Passed |
| Full-project ESLint | Passed |
| C++ native compilation | Passed |
| Unit layer | 70 passed, 0 skipped |
| Integration layer | 10 passed, 0 skipped |
| Native cross-check layer | 4 passed, 0 skipped |
| Python verifier tests | 11 passed |
| Fresh TypeScript → independent Python replay | 6 reports, 61,953 scalar comparisons agreed |

This is **95 test cases**, plus the cross-language replay comparisons. Those
comparisons are not 61,953 separate tests. Accounting and fingerprints compare
exactly; floating risk outputs use the verifier's documented tolerances.

`.github/workflows/verify.yml` runs the same `pnpm verify:ci` gate with a MongoDB
8.0.17 service, Node 24.19.0 and Python 3.12. Workflow YAML parses locally. The
GitHub runner and container path have **not** executed while GitHub publication
is paused. Milestone 3 still needs its first successful remote run before its
full acceptance criterion can be marked complete.

## Limits and next evidence

These checks do not cover MongoDB replica failover, database process crashes,
network partitions, losing a majority-acknowledged response, OS clock steps on
the database server, multi-region deployment or external side effects. The local
server does not model replicated durability. No throughput or latency claim is
derived from test duration. The standalone service is not hosted in staging;
the private website still uses Workers + D1.

At scale, measure contention and query plans before changing the queue. The
database-time expression must be evaluated at the intended workload; current
tests establish correctness, not index efficiency. Add replica-set failover and
lost-acknowledgment fault cases, durable job/attempt telemetry, queue age and retry
alerts, measured backpressure, and explicit retention/backup policies. Keep all
external effects separately idempotent. These are future tests/design work,
not completed reliability guarantees.

Implementation references: [MongoDB single-document atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/),
[database system variables](https://www.mongodb.com/docs/manual/reference/aggregation-variables/),
and [aggregation updates with literal values](https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/).
