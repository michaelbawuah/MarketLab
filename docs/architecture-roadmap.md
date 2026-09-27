# MarketLab architecture roadmap

MarketLab is intended to remain JavaScript/TypeScript-intensive. This roadmap records the agreed direction separately from the running deployment.

The [engineering roadmap](engineering-roadmap.md), adopted from the supplied PDF on September 26, controls the work order. This document maps components and runtime ownership; earlier provider-expansion priorities are superseded.

| Component | Current implementation | Planned role |
| --- | --- | --- |
| React / TypeScript | Dashboard, historical data, event editor, portfolio import and Research lab | Primary research interface |
| TypeScript finance modules | Exact accounting, validation, historical portfolio analysis and fixed-rule backtests | Reusable reference engine across runtimes |
| Node.js | Standalone signed research API and persistent worker-thread pool; running on Railway free-trial staging | Production operations, broader imports and scheduled ingestion |
| MongoDB | Durable research job/result storage with owner isolation, atomic quotas, leases and replay protection; private persistent staging database | Backup/retention, failover verification and broader data ownership |
| C++ | Compiled Node-API risk kernel, nine native parity checks per job, recorded kernel/worker/RSS benchmarks | Optimize broader workloads only when profiling justifies it |
| Python | Offline independent Research lab replay with exact accounting, signal/trade and risk checks; 2,500-observation cross-language verification | Extend supporting verification to historical portfolio accounting |
| Workers + D1 / SQLite | Hosted app and persistence, public report summaries, owner workspace and account-bound report discussion | Continue supporting the working app until an explicit, tested backend transition |

The Node/MongoDB/C++ service runs on Railway free-trial staging with HTTPS, authenticated private MongoDB and matching server-side gateway secrets. Remote crash recovery passed, and the owner's September 27 screenshots confirm saved-experiment recomputation with nine native comparisons. D1 remains authoritative for the working website; Mongo jobs own copied immutable snapshots and their outputs. No database migration or production-service cutover has occurred. See [staging evidence and limits](research-staging.md) and `research-service.md` for the runtime boundary.

The historical portfolio milestone keeps pure TypeScript accounting separate from API/database code so the future Node backend can reuse it. It introduces no new infrastructure requirement for existing users.

The release includes matched-date benchmark/risk comparisons, frozen experiments, next-close strategy backtests with costs and chronological evaluation, cash-flow-matched portfolio benchmarking and independent Python research verification. Reliability evidence covers MongoDB-clock lease fencing, process-kill recovery and passing CI gates. Product milestones add the one-click fictional experiment, confidence certificates, Schwab CSV import, measured local service performance, exact-money examples, public report summaries and equity-curve event markers. Invite-only comments passed automated authorization checks and the user reported completing a separate-account comment and revocation flow. The [engineering roadmap](engineering-roadmap.md) records each milestone's evidence and remaining checks; future scope has not been expanded.
