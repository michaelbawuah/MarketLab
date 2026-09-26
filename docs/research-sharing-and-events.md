# Read-only reports and equity-curve events

September 26, 2026 · roadmap milestones 9–10.

## User flow

Open a saved Research lab experiment and select **Share report**. The dialog
shows the complete proposed public summary before consent. When public sharing
is activated, the owner can create a 7- or 30-day read-only link, copy it, replace
it or revoke it. Replacing a link invalidates the old one. Expired, replaced and
revoked links display an unavailable page without revealing which case applies.

The report includes symbols, dates, rule/cost settings, starting cash, exact
wealth observations, executions, declared corporate events and the confidence
certificate for each evaluation period. It excludes private experiment names,
original source labels, input identifiers, raw input price series, account data
and brokerage records. The projection uses explicit field allowlists. The
summary explains that its redacted inputs cannot independently replay the full
experiment and that recipients may retain downloaded copies after revocation.

## Current activation boundary

The user approved public report access on September 26, 2026. The Site audience
is public and `PUBLIC_REPORT_SHARING_ENABLED=true` is deployed as runtime
revision 3. `WORKSPACE_OWNER_EMAIL` is configured separately as a runtime
secret; production workspace pages and every private API require
the Sites dispatcher's authenticated user ID and matching verified email.
Anonymous and other-user requests cannot access private data. Development-only
local preview fallback is excluded from the production build.

The activation flag still defaults to disabled in unconfigured environments.
The complete reviewed sharing flow is enabled in production. No personal
experiment was selected or shared during activation.

`/example` is a public, read-only view of the existing deterministic XDEMO
teaching fixture using illustrative costs. It is computed from built-in fictional
inputs, carries the same redacted summary and confidence UI, and neither reads
nor creates workspace data. It is labeled as a permanent example, distinct from
an owner's expiring/revocable shared report. Each saved report still requires
its owner's preview and consent; public routing does not publish existing runs.

The native deployment and audience updates succeeded. Direct anonymous requests
to `/`, `/api/research` and `/api/workspace` from this execution environment
returned host-edge HTTP 403 with code 1010 before the application could be
checked. Web retrieval could not access the URL either. These results are not
successful live authorization tests; a real browser check of a valid owner-made
link and private-workspace denial remains outstanding. No bypass was added.

## Link storage and correctness

`research_shares` has one row per `(owner, run_id)` and a unique token hash. Links
use 32 random bytes; only their SHA-256 digest is stored. A fresh preview digest
binds consent to the exact summary being published. Atomic insert/update
conditions fence the current revision: simultaneous creation accepts one link,
and stale replacements or revocations cannot overwrite a newer version. Expiry
is enforced on every read, and the saved summary digest detects corruption.

Read-only pages and APIs return no-store, no-referrer and noindex headers and
disallow embedding. There is no public experiment listing or public write API.
Robots directives are advisory; link possession authorizes reading the summary.

## Event timeline

The Research lab and shared-summary chart show strategy buys/sells, split and
dividend events, and the beginning of each evaluation period. Selecting a marker
or the equivalent dropdown reveals the effective date and exact cash, fee,
share and execution assumptions. Nearby markers are grouped without discarding
events, and larger groups are paginated. Changing evaluation periods starts
fresh cash with no carried shares or dividend receivables.

Splits precede same-day dividend entitlement, which precedes that close's trade.
An event between supplied closes retains its effective date and attaches to the
next real observation; no missing price is invented. Marker calculations do not
change the equity curve. This release annotates Research lab strategy curves;
it does not add a multi-instrument portfolio cash-flow timeline or claim to
explain every market price movement.

The chart uses its available width for coordinates, keeping axis text and
interaction targets at readable sizes on narrow screens. Existing retained
desktop and narrow-screen screenshots were inspected; the latest sizing change
was checked through type/build validation, not a new browser session.

## Executed acceptance evidence

- 113 TypeScript unit tests, 16 integration tests, 4 native cross-check tests and
  11 Python verifier tests passed: **144 tests**, no skipped Node tests.
- Independent Python replay matched **66,678 scalar fields** across nine reports.
- The production-built Worker passed **54 HTTP/header/content assertions** using
  disposable local D1 and fictional data. No production records were seeded.
- Type checking, lint and the production build passed in the full local gate.
- After the final responsive-chart adjustment, type checking, lint, build and
  the 54 Worker assertions were rerun; the untouched calculation suites were
  reused from the full gate.

Full captured output: [local gate](evidence/milestones-9-10-local-gate.txt) and
[final Worker check](evidence/milestones-9-10-final-worker.txt).
The activation release adds four built-Worker checks for the public fictional
example: 404 with sharing disabled, 200 when enabled, fictional labeling and no
private fixture contents. All **58 assertions** passed, alongside type checking,
lint and a fresh build; see [activation output](evidence/public-sharing-activation-local.txt).
The unchanged 144 calculation/integration tests and 66,678 comparisons retain
their passing checkpoint at GitHub `0c3476a`.

Local D1 assertions do not verify the live Sites dispatcher. Node/MongoDB staging
activation and collaboration remain milestones 11 and 12. Staging requires a
real Node/container host, TLS, authenticated persistent MongoDB and server-side
signing secrets; the existing local-only Compose recipe is not that deployment.
