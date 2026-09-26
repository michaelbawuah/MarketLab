# MarketLab architecture roadmap

MarketLab is intended to remain JavaScript/TypeScript-intensive. This roadmap records the agreed direction separately from the running deployment.

The [engineering roadmap](engineering-roadmap.md), adopted from the supplied PDF on September 26, controls the work order. This document maps components and runtime ownership; earlier provider-expansion priorities are superseded.

| Component | Current implementation | Planned role |
| --- | --- | --- |
| React / TypeScript | Dashboard, historical data, event editor, portfolio import and Research lab | Primary research interface |
| TypeScript finance modules | Exact accounting, validation, historical portfolio analysis and fixed-rule backtests | Reusable reference engine across runtimes |
| Node.js | Standalone signed research API and persistent worker-thread pool; locally verified | Production service deployment, broader imports and scheduled ingestion |
| MongoDB | Real durable research job/result storage with owner isolation, atomic quotas, leases and replay protection; locally verified | Production database activation, backup/retention and broader data ownership |
| C++ | Compiled Node-API risk kernel, nine native parity checks per job, recorded kernel/worker/RSS benchmarks | Optimize broader workloads only when profiling justifies it |
| Python | Offline independent Research lab replay with exact accounting, signal/trade and risk checks; 2,500-observation cross-language verification | Extend supporting verification to historical portfolio accounting |
| Workers + D1 / SQLite | Current private hosted API and persistence | Continue supporting the working app until an explicit, tested backend transition |

The Node/MongoDB/C++ service is implemented and verified locally. Production activation still requires a Node hosting target, authenticated MongoDB URI, TLS and matching server-side secrets. D1 remains authoritative for the working website; Mongo jobs own copied immutable snapshots and their outputs. No production cutover or user-data migration has occurred. See `docs/research-service.md` for the boundary, setup and remaining checks.

The historical portfolio milestone keeps pure TypeScript accounting separate from API/database code so the future Node backend can reuse it. It introduces no new infrastructure requirement for existing users.

Completed research release: matched-date benchmark/risk comparisons, frozen experiment inputs/results, and a simple next-close strategy backtest with costs and chronological evaluation. Later additions include cash-flow-matched portfolio benchmarking, frozen benchmark reports and independent Python research verification. The first roadmap reliability milestones now include MongoDB-clock lease fencing, a real process-kill recovery check, labeled test layers and a prepared CI gate. A one-click fictional experiment now computes the effect of costs in the browser without imports, market-data credentials or persistence. Report views and exports now include scoped confidence certificates and plain-language takeaways. Next product work follows the adopted order: a real brokerage CSV format, then measured end-to-end performance evidence. The current site remains owner-private; the background service has not been activated on a staging host.
