# MarketLab engineering roadmap

Adopted September 26, 2026 from Michael's
[Engineering Standards & Forward Roadmap](engineering-standards-and-roadmap.pdf).
This is the controlling work order. Earlier architecture notes describe the
implementation, but do not override these priorities.

## Goal and product

Build a JavaScript/TypeScript research workspace that helps people understand
portfolio results, compare reproducible experiments and inspect the inputs and
assumptions behind each result. The primary recruiting goal is Quant SWE:
demonstrable correctness, reliable concurrent systems and honest performance
evidence. User adoption by students, clubs or developers is a second concrete
goal. No hiring outcome, trading edge or institutional endorsement is implied.

## Ordered milestones

| # | Milestone and acceptance evidence | Status on September 26 |
| --- | --- | --- |
| 1 | Fix a real concurrency defect; a regression fails before the fix and passes after it | Implemented and locally proved: three client-clock lease regressions fail on the baseline and pass with MongoDB-clock fencing |
| 2 | Kill a worker mid-job; recover with one durable final result | Implemented and locally proved: SIGKILL after calculation/before save, natural lease expiry, two competing runners, one saved result |
| 3 | Label unit/integration/cross-check layers; financial invariants and independent Python/TS verification run in CI | Complete local foundation gate and [GitHub Actions gate](https://github.com/michaelbawuah/MarketLab/actions/runs/36254911641) passed. The remote run includes the later demo/certificate work and 66,678 cross-language comparisons; [execution evidence](verification.md) |
| 4 | One-click synthetic demo, no setup/import, useful insight in under one minute | Implemented and locally verified: one click shows the calculated effect of costs, with three presets, exact observations and a downloadable report. Desktop and narrow-screen checks passed; [acceptance evidence](quick-demo.md) |
| 5 | Every report shows a confidence certificate and a plain-language takeaway | Implemented and locally verified across report views, previews and exports. Per-result consistency checks, source/coverage details, assumptions and explicit independent-replay status; [acceptance evidence](confidence-certificates.md) |
| 6 | Import one real brokerage CSV format without manual cleanup | Implemented: Schwab transaction-history adapter, conversion receipt, explicit fee/cash reconciliation and fail-closed unsupported rows. Native-format fictional file uploaded, previewed and saved in browser; no real customer export supplied. [Acceptance evidence](brokerage-import.md) |
| 7 | Publish a measured p99 or throughput for a defined workload | Measured and recorded: 3 × 1,000 verified jobs, 39.96 jobs/s aggregate and 319.77 ms combined client p99. Separate Node process, real disposable MongoDB, two workers, eight clients; local closed-loop scope. [Evidence and reproduction](service-performance.md) |
| 8 | Explain the money representation and show a failing naive-float example | Implemented and verified: runnable payment and half-cent examples fail with naive Number arithmetic and pass with canonical exact helpers. Interactive Methodology demo, six new regressions and full local gate passed. [Representation and evidence](money-arithmetic.md) |
| 9 | Share a saved experiment through a read-only unauthenticated link | Public access activated with user approval; private workspace remains owner-only. Preview, consent, redaction, expiry, replacement, revocation and isolation verified in the built Worker. Live browser/owner-link lifecycle check remains outstanding because automated probes were blocked at the host edge. [Evidence and activation boundary](research-sharing-and-events.md) |
| 10 | Put explanatory event markers directly on the equity curve | Implemented and verified: selectable strategy executions, split/dividend events and fresh-cash starts, with original effective dates, exact amounts and grouped narrow-screen controls. [Evidence and scope](research-sharing-and-events.md) |
| 11 | Run the background service and recovery test on a real staging host | Pending; local MongoDB tests and the hosted website are not staging activation of this service |
| 12 | Let a second user comment on or fork a shared saved experiment | Pending; depends on sharing and an explicit collaboration model |

Items 1–3 establish the engineering foundation. Items 4–6 improve first use and
adoption. Items 7–12 extend evidence, distribution and collaboration. Extra
strategies, more asset classes and significance tests remain deferred.

## Directory map

| Path from repository root | Responsibility |
| --- | --- |
| `app/` | React interface and hosted API routes |
| `lib/finance/` | Canonical TypeScript accounting, validation, portfolio and experiment engines |
| `app/quick-demo.tsx`, `lib/finance/quick-demo.ts` | One-click fictional cost comparison, using the canonical research engine |
| `lib/finance/confidence.ts`, `app/confidence-certificate.tsx` | Per-result evidence and takeaways shared by report views and exports |
| `lib/finance/brokerage-csv.ts`, `app/brokerage-receipt.tsx` | Schwab CSV conversion, exact cash/fee checks and saved import receipt |
| `public/examples/schwab-transactions.csv`, `tests/unit/brokerage-csv.test.ts` | Fictional native-format example and adapter/accounting regressions |
| `services/research/` | Standalone Node API, MongoDB job store, worker pool and recovery |
| `scripts/benchmark-service.ts`, `scripts/benchmark/` | Isolated load runner, deterministic profiles, correctness gates, timings and resource diagnostics |
| `lib/finance/money-examples.ts`, `app/money-demo.tsx`, `scripts/demo-money.ts` | Interactive and command-line contrasts between naive decimals and exact money |
| `lib/research-sharing.ts`, `lib/finance/shared-research.ts`, `app/share/` | Owner-reviewed public-summary projection, fenced link lifecycle and read-only report page |
| `app/equity-chart.tsx`, `lib/finance/equity-events.ts` | Research-curve markers and exact event explanations |
| `scripts/test-hosted-sharing.ts` | Built Worker HTTP checks against disposable D1; never production test records |
| `native/` | C++ risk kernel; supporting verification/measurement |
| `verification/python/` | Independent report replay and verifier rejection tests |
| `tests/unit/` | Pure financial and input invariants |
| `tests/integration/` | Real database, HTTP, worker and crash tests |
| `tests/cross-check/` | Independent native parity |
| `tests/fixtures/` | Reproducible synthetic inputs and isolated failure injection |
| `.github/workflows/verify.yml` | Automated verification gate for GitHub pushes, pull requests and manual runs |
| `docs/reliability-evidence.md` | Reproduction steps, results, mechanism and limits |
| `docs/evidence/` | Captured test output supporting completed milestones |

The local checkout is the existing MarketLab Site repository. The deployed
website still uses Workers + D1; Node/MongoDB/C++ is a separate local service.
See [architecture-roadmap.md](architecture-roadmap.md) for runtime ownership and
[tests/README.md](../tests/README.md) for the layered verification commands.

## Working rule

GitHub batching: milestones 6–8 were published as `799222d` on September 26.
The next requested two-milestone batch covers 9–10 and its GitHub checkpoint.
Milestone 9 public access is approved and activated. Its live owner-created-link
lifecycle still requires a real browser check; automated host probes were blocked.
Milestones 11–12 remain outstanding. Preserve public report routing and the
owner-only private workspace. Keep JavaScript/TypeScript central; MongoDB is a
database used by the separate research service, not a GitHub language category.

For each milestone, record the user problem, implementation, acceptance check,
actual result and remaining limits. A planned feature, written test or configured
workflow is not a successful execution. Preserve failing-before evidence for
concurrency fixes and report measured workloads with their environment.

The source document's "exactly once" recovery criterion means one durable,
fenced finalization here. A crashed attempt can be calculated again. Database
replication/failover and arbitrary external side effects need separate evidence.
