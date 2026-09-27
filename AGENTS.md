# MarketLab working direction

Read `docs/engineering-roadmap.md` before choosing the next milestone. It tracks
the user-supplied `docs/engineering-standards-and-roadmap.pdf`, the controlling
priority order. `docs/architecture-roadmap.md` describes the runtime boundary;
`docs/verification.md` and `docs/reliability-evidence.md` record observed checks.

- The primary goal is Quant SWE evidence: correctness, reliability, observability,
  reproducible measurements and useful research workflows. Keep TypeScript central.
- Follow the ordered roadmap. Extra strategies, asset classes and statistical
  significance features are deferred while higher-priority milestones remain.
- Preserve exact money/share arithmetic, causal execution, frozen input hashes,
  owner isolation and explicit synthetic-data labeling.
- Record a milestone as done only with its acceptance evidence. Keep local tests,
  remote CI runs, hosted deployment and actual adoption distinct.
- Computations may retry. Claim one durable fenced finalization, never exactly-once
  computation or profitability from a backtest.
- The existing hosted app uses Workers + D1. Node/MongoDB/C++ is a separate service;
  do not describe it as deployed until a staging host is actually verified.
- The user resumed GitHub publishing on September 26, 2026. The repository is
  `michaelbawuah/MarketLab`, branch `main`. Preserve remote history and verify the
  published files and Actions result after a transfer. Sites source saving is separate.
- Milestones 6–8 were published as GitHub `799222d`; the 9–10 implementation
  checkpoint is `0c3476a`, with passing remote verification. On September 26 the
  user explicitly approved public report access while keeping the workspace
  owner-only. The Site audience is now public and production
  `PUBLIC_REPORT_SHARING_ENABLED=true`; preserve the owner email restriction.
  `/example` uses only the built-in fictional teaching data, without reading or
  creating personal records. Automatic requests to the live host returned edge
  403/1010; do not claim a successful live browser or owner-sharing lifecycle
  check from local Worker tests. Node/MongoDB staging remains outstanding.
  Keep TypeScript/JavaScript central.

- The immediate user-reported blocker is market-data access: NVDA also failed
  with a newly acquired one-time Alpha Vantage key on September 26. A configured
  server key is not required for that path. The app's old generic limit message
  did not establish the user's remaining quota or the upstream HTTP status.
  New failures expose bounded, redacted provider diagnostics to the owner only;
  those details are not persisted in run history. A successful live non-IBM
  fetch remains unverified. Obtain the new Copy diagnostic output before blaming
  the account, recommending another key or claiming this blocker resolved.

Directory map and commands: `docs/engineering-roadmap.md` and `tests/README.md`.
