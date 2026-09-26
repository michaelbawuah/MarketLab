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
tests, native parity, Python verifier tests, then fresh TypeScript/Python replay.
The same command is configured in `.github/workflows/verify.yml` for pushes, pull
requests and manual runs. The workflow has not run on GitHub while publishing is
paused; a successful local gate is not evidence of a remote CI run.

## Focused checks

```sh
pnpm native:build
MONGOD_BIN=/path/to/mongod pnpm test:service:local tests/integration/lease-clock.test.ts
MONGOD_BIN=/path/to/mongod pnpm test:service:local tests/integration/crash-recovery.test.ts
pnpm test:python
pnpm test:parity
```

Unit examples include cash-flow exclusion from returns, cash/share conservation,
fee and dividend reconciliation, exact fractional split holdings, rejection of
overdrafts/shorts, chronological execution and frozen-report identity. These
assert financial outcomes, not only UI shape or implementation details.

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
