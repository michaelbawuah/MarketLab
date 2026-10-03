# MarketLab working direction

- October 3 Quant SWE extension: bounded active research admission and an honest
  fixed-arrival overload/recovery benchmark are authorized. Keep private data,
  TypeScript ownership, exact accounting and the $0 paid cap. See
  `docs/overload-handling.md`; the three-person pilot remains a separate real-user
  acceptance gate.
- October 3 hosted admission activation: the user explicitly approved the exact
  temporary root-reference proposal (“I approve 100%”). The pinned tested source
  2ee9906e5aeb84caf76c6dc5a2efc8251c2f19b0 migrated the schema and passed all 12
  hosted checks, including native/Python verification and natural 60-second lease
  recovery. See docs/evidence/research-admission-2026-10-03-*.json.
  Temporary migration variables were deleted; fresh deployment
  5e83982a-fa69-4520-82ba-3ecfa358740b starts the ordinary server and is healthy.
  The source remains pinned; future changes require a tested explicit source
  update. No further administrator access is authorized or needed. Do not use
  the old slotless writer after this strict-schema barrier. Redeploy may reuse a
  prior startup snapshot; verify actual logs, not service settings alone.

- September 28 ongoing-use extension: goals, manual multi-account aggregation,
  fee projections, allocation drift alerts, what-if scenarios, opt-in peer cohorts,
  and a verified strategy library are now authorized. Preserve private records,
  explicit sharing consent, and the $0 paid-spend limit. Bank aggregation is a
  later integration after traction; do not claim connected accounts or automatic
  refresh. Planning assumptions are hypothetical, never forecasts or advice.

Read `docs/engineering-roadmap.md` before choosing the next milestone. It tracks
the user-supplied `docs/engineering-standards-and-roadmap.pdf`, the controlling
priority order. `docs/architecture-roadmap.md` describes the runtime boundary;
`docs/verification.md` and `docs/reliability-evidence.md` record observed checks.

- September 28 extension: the user explicitly authorized personal saved portfolio
  workspaces for new users, closing test/live-check gaps and a three-person pilot.
  This supersedes the older single-owner workspace and discussion-only email scope.
  Every authenticated account owns its records; never merge accounts by email.
  See `docs/personal-workspaces.md` for the model and evidence. Do not claim
  participant observations from automated fixtures or agent testing.
- The current user priority (September 28) is consumer usability: instant value,
  plain language, sensible defaults and consistent visual design. Keep the
  calculation and verification sophistication underneath this experience. See
  `docs/consumer-experience.md` for the seven required product standards.
- Preserve Quant SWE evidence: correctness, reliability, observability and
  reproducible measurements. Keep TypeScript central.
- Follow the ordered roadmap. Extra strategies, asset classes and statistical
  significance features are deferred while higher-priority milestones remain.
- Preserve exact money/share arithmetic, causal execution, frozen input hashes,
  owner isolation and explicit synthetic-data labeling.
- Record a milestone as done only with its acceptance evidence. Keep local tests,
  remote CI runs, hosted deployment and actual adoption distinct.
- Computations may retry. Claim one durable fenced finalization, never exactly-once
  computation or profitability from a backtest.
- The hosted app uses Workers + D1. Node/MongoDB/C++ is a separate service;
  Railway staging was verified September 27. Keep its scope and limits explicit.
- The user resumed GitHub publishing on September 26, 2026. The repository is
  `michaelbawuah/MarketLab`, branch `main`. Preserve remote history and verify the
  published files and Actions result after a transfer. Sites source saving is separate.
- Milestones 6–8 were published as GitHub `799222d`; the 9–10 implementation
  checkpoint is `0c3476a`, with passing remote verification. On September 26 the
  user explicitly approved public report access while keeping the workspace
  owner-only. The Site audience is now public and production
  `PUBLIC_REPORT_SHARING_ENABLED=true`. The original email restriction was
  superseded by the later personal-workspace authorization above.
  `/example` uses only the built-in fictional teaching data, without reading or
  creating personal records. Automatic requests to the live host returned edge
  403/1010; do not claim a successful live browser or owner-sharing lifecycle
  check from local Worker tests. That checkpoint did not include Node/MongoDB staging.
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
- Milestone 11 passed on Railway September 27: scope=staging, public HTTPS,
  private persistent MongoDB, a 60-second lease, two attempts, one durable
  finalization and nine native comparisons. See `docs/research-staging.md` and
  its checked-in receipt/deployment evidence. The temporary remote acceptance
  start command was removed; the normal service is healthy on the same image.
  The user authorized free trial only, no paid upgrade. Keep Mongo private.
  The 500 MB trial volume uses a 50 MB index-build free-space reserve.
  CI, runner-crash recovery, database failover and owner-browser checks remain
  distinct. Gateway variables were configured only after remote acceptance;
  the owner's September 27 8:52 AM screenshots confirm saved NVDA experiment
  background recomputation with nine native comparisons. This is separate from
  the independent Python replay receipt. The September 28 extension adds
  owner-triggered report-bound receipts; see `docs/independent-replay.md` for
  digest validation, sharing consent and observed acceptance boundaries.
  Milestone 12 uses the approved invite-only comments model in
  `docs/research-collaboration.md`: same redacted report, ChatGPT account-bound
  single-use invitations, retained comments on revocation, private append-only
  audit trail. Do not expand discussion invitations to forks, raw-input sharing or access
  to the report owner’s workspace. Invitees may create their own separate workspace.
  On September 27 at 9:38 AM America/New_York, the user reported completing the
  fresh-invitation, separate-account comment and revocation checklist. Milestone
  12 is accepted within that scope. Keep this user-reported result distinct from
  agent-observed screenshots, automated checks and broader adoption evidence.
  Before future runtime
  deploys, keep Railway SOURCE_COMMIT synchronized with the exact GitHub source.

Directory map and commands: `docs/engineering-roadmap.md` and `tests/README.md`.

- September 27 email-login scope: the user explicitly selected invited discussions,
  not separate user workspaces. See `docs/discussion-email-sign-in.md`. WorkOS
  Staging is configured and enabled for live acceptance. The first live callback
  failed session validation. Version 28 still rejected `issuer_mismatch`; the
  application's live WorkOS OIDC discovery identifies a client-specific issuer.
  That exact configured-client issuer is now supported, with 234 built-Worker
  checks passing. On September 27 at 23:42 America/New_York, the user confirmed
  sign-in worked. The live callback at 2026-09-28T03:42:20.107Z independently
  logged a verified email session. At 23:59 America/New_York, after the explicit
  invitation acceptance, comment, refresh, sign-out and revocation checklist,
  the user replied "worked out." The email discussion extension is accepted
  within that user-reported scope. Keep the observed callback and user-reported
  lifecycle evidence distinct from automated fixtures and broader adoption.
  Preserve ChatGPT identity binding, owner isolation, and the $0 paid-spend limit.
