# Test layers

| Layer | Location | What failure means | Command |
| --- | --- | --- | --- |
| Unit | `tests/unit/` | A finance invariant, input boundary or comparison rule regressed | `pnpm test:unit` |
| Integration | `tests/integration/` | Real MongoDB, signed HTTP, worker threads, concurrent ownership or process recovery failed | `pnpm test:integration` |
| Cross-check | `tests/cross-check/`, `verification/python/` | Independent C++ or Python calculations disagree with TypeScript, or verifier rejection checks failed | `pnpm test:cross-check` |

`pnpm test` aliases the fast unit layer. It is not the complete release gate.
Integration tests require a real MongoDB instance and a compiled native addon;
missing prerequisites fail visibly instead of silently skipping tests.

## Full local gate

Requirements: Node 24, the pinned pnpm version, Python 3.11+, a C++17 compiler and
MongoDB 8.0.17. Install dependencies with `pnpm install --frozen-lockfile` first.

```sh
# Starts a disposable loopback database, runs every gate and cleans up its data.
MONGOD_BIN=/path/to/mongod pnpm test:service:local --ci

# Or use a dedicated test server; each test creates and drops its own unique DB.
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 pnpm verify:ci
```

`verify:ci` runs type checking, lint, native compilation, unit tests, integration
tests, native parity, Python verifier tests, fresh TypeScript/Python replay,
then a production build and `test:hosted` against isolated local D1.
The same command is configured in `.github/workflows/verify.yml` for pushes, pull
requests and manual runs. Inspect the
[GitHub Actions runs](https://github.com/michaelbawuah/MarketLab/actions/workflows/verify.yml)
and [verification records](../docs/verification.md) for observed remote results;
a successful local gate alone is not evidence of a remote CI run.

## Focused checks

```sh
pnpm native:build
MONGOD_BIN=/path/to/mongod pnpm test:service:local tests/integration/lease-clock.test.ts
MONGOD_BIN=/path/to/mongod pnpm test:service:local tests/integration/crash-recovery.test.ts
pnpm test:python
pnpm test:parity
pnpm demo:money
```

Unit examples include cash-flow exclusion from returns, cash/share conservation,
fee and dividend reconciliation, exact fractional split holdings, rejection of
overdrafts/shorts, chronological execution and frozen-report identity. These
assert financial outcomes, not only UI shape or implementation details.

The money demonstration contrasts naive Number calculations with canonical
exact accounting. `pnpm demo:money --naive` intentionally exits 1; the default
comparison and `--exact` exit 0 when their contracts hold. Half-cent boundaries,
overdraft rejection, basis conservation and JSON precision run in the normal
unit layer. See [money arithmetic](../docs/money-arithmetic.md).

Certificate tests additionally mutate wealth, fees, return values, dates, signal
timing and benchmark flows to ensure inconsistent reports cannot earn passing
checks. They distinguish project tests from independent per-report receipts and
round-trip full certificate metadata through rectangular CSV exports.

The crash fixture calculates through the real TypeScript engine, then blocks on
a test-only worker barrier before returning the result. The test sends SIGKILL
to its entire runner process, waits for natural database lease expiry and starts
two replacement runners using the normal native-verifying worker. It checks one
durable result, two attempts, stale-token rejection and replay through a fresh
database connection. This demonstrates one failure window on a single MongoDB
server, not database failover, network-partition recovery or staging readiness.

Shared fixture code lives in `tests/fixtures/`; the normal worker has no crash
barrier or fault-injection environment flag. A worker factory allows the test
to inject its barrier without altering the production calculation path.

## Service performance evidence

`tests/unit/benchmark-service.test.ts` checks percentile boundaries, failure
accounting, deterministic input/owner limits and rejection of corrupt results.
It does not claim a successful load run. The separate `pnpm bench:service` command
starts real isolated MongoDB and Node processes, gates each result, retains raw
timings and inspects durable jobs. See [the measured workload and reproduction
instructions](../docs/service-performance.md). Timings are not CI pass/fail
thresholds on shared runners. The recorded run and unit output are separate
artifacts; staging performance remains unmeasured.

## Read-only sharing and event markers

`tests/integration/research-sharing.test.ts` uses real local D1 to verify consent,
reviewed digests, owner isolation, concurrent creation, revision-fenced
replacement/revocation, expiry and payload integrity. The unit layer verifies
redaction and exact event explanations, including splits before dividends,
between-close dates, fresh holdout funds and dense marker grouping.

`pnpm verify:hosted` builds the actual Worker, seeds fictional inputs into a
disposable D1 database and runs 66 HTTP/header/content assertions directly in
Miniflare/workerd, without Wrangler's development HTTP proxy. It covers
activation disabled/enabled, anonymous report reads, private API denials,
consent, cross-origin rejection, stale updates, immutable reads and revoked
pages, plus the activation-gated fictional public example and owner-only,
redacted provider diagnostics that are excluded from saved request history.
Only the external provider is stubbed, using a fictional key. Trusted identity
headers are simulated locally; this does not prove real provider access or the
live Sites dispatcher's authentication or anonymous reachability.
