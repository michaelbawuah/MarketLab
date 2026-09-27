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

- The immediate market-data blocker now has live evidence: the September 26
  9:11 PM screenshot showed a hosted NVDA HTTP-200 `Note` describing the standard
  25-request allowance; the 9:20 PM direct-browser screenshot showed NVDA daily
  prices refreshed September 25. Do not blame the key or assert a proven IP
  limit. One-time keys now use a direct browser request, followed by a validated
  server save; configured keys and the public demo retain their server path.
  Both paths share the atomic owner cooldown, with no automatic provider retries.
  Keys/raw provider notices never return to the server on the browser path.
  Preserve distinct `alphavantage-browser` provenance throughout exports,
  confidence reports and TypeScript/Python verification. The server cannot
  independently authenticate browser-supplied data. The September 26 9:43 PM
  screenshot and the user's "finally" confirm the live NVDA save: browser-import
  provenance, May 5–September 25 history, latest saved close $225.07.
- Milestone 11 preparation now includes the production Docker image, isolated
  operator-only crash acceptance command and a separate container CI gate.
  See `docs/research-staging.md`. A passing CI container run is not staging:
  host/account access and a real persistent deployment's 60-second-lease
  acceptance receipt remain required. Do not activate the Site gateway early.

Directory map and commands: `docs/engineering-roadmap.md` and `tests/README.md`.
