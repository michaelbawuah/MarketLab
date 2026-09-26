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
- After the successful publication through milestone 5, the user asked to batch
  the next GitHub commit/push until 3–4 additional milestones are complete
  (milestones 6–8 or 6–9). Continue building and saving the Site in the meantime;
  do not push each milestone to GitHub. Milestones 6–8 form the current checkpoint;
  after its publication, resume at milestone 9. Keep TypeScript/JavaScript central.

Directory map and commands: `docs/engineering-roadmap.md` and `tests/README.md`.
