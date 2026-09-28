# Release verification

## Exact-money demonstration and milestones 6–8 checkpoint — September 26, 2026

- Added two fictional examples to Methodology: a valid 20¢ payment rejected by
  naive decimal subtraction, and a $1.005 share price incorrectly rounded to
  100¢ by `Math.round`. Canonical exact helpers accept both cash payments and
  round the trade to 101¢. Existing production accounting is unchanged.
- Executed `pnpm demo:money --naive` (expected exit 1), `--exact` (exit 0), and
  the default comparison (exit 0). [Captured output](evidence/money-arithmetic.txt).
  [Representation and rounding policy](money-arithmetic.md) identifies each
  conversion boundary and separates exact bookkeeping from approximate ratios.
- The full local `test:service:local --ci` gate passed type checking, lint, native
  compilation, 104 unit tests, 10 real MongoDB/HTTP/worker integration tests,
  4 native cross-checks and 11 Python tests: 129 tests total. Node suites report
  zero skips. Python independently matched 66,678 fields in nine fresh reports.
  [Complete gate output](evidence/milestones-6-8-local-gate.txt).
- The six new unit regressions cover the two float failures, half-cent price
  boundaries, millionth-share quantities, a true one-cent overdraft, allocation
  of all remaining basis and decimal-string JSON precision.
- Browser QA switched between both examples on desktop and in a 390px iframe,
  expanded the explanation and checked the responsive result cards. Expanded
  modal content had equal client/scroll widths of 373px; the card's were 323px.
  The mobile menu also responded to keyboard activation. This is browser layout
  verification, not a physical-device test or a full accessibility audit.
  [Desktop capture](money-preview.jpg) · [Narrow capture](money-narrow.jpg).
- This checkpoint includes Schwab import (milestone 6), measured local service
  performance (7) and the money explanation (8). Local checks do not establish
  remote CI success; the associated [GitHub Actions run](https://github.com/michaelbawuah/MarketLab/actions/workflows/verify.yml)
  records that separately. Neither the private website nor local tests deploys
  the Node/MongoDB service to staging.


## Service throughput and p99 — September 26, 2026

- Added a TypeScript load runner for the existing Node/MongoDB service. Each
  repetition starts fresh local database and service processes, preserves normal
  auth/quota/validation rules, and measures signed submission through full-result
  receipt and verification with two native-verifying workers and eight clients.
- Three repetitions of 1,000 jobs with 500 observations per instrument passed:
  3,000 canonical result/input checks, 3,000 one-attempt completions and all
  post-run persistent owner/ID checks. No errors or unstarted jobs occurred.
  Aggregate throughput was 39.96 jobs/s and combined client-observed p99 319.77 ms.
- Thirty-two warm-up jobs per repetition and an initial 24-job smoke run are
  excluded from the published statistics. Every raw measured job timing is
  retained. Independent Python arithmetic reproduced rates and percentiles and
  confirmed the recorded source/native-binary hashes; this was a statistics
  audit, not independent financial-model replay.
- All 98 unit tests pass, including five load-run accounting/correctness cases.
  Type checking and lint pass. The pre-existing Mongo crash/lease, native and
  Python replay suites were not rerun; their runtime source did not change.
- This is local closed-loop evidence on shared hardware, with loopback traffic
  and polling included. No saturation capacity, production SLA, browser/gateway
  latency, staging activation, new remote CI run or GitHub push is claimed.

See [service-performance.md](service-performance.md) for the environment,
reproduction command, raw reports and scope. The hosted user interface and
production data were not modified for this milestone.

## Brokerage CSV import — September 26, 2026

- Added the TypeScript Schwab transaction-history adapter, source review and a
  saved conversion receipt. The server reparses raw input; unsupported activity
  rejects the entire file. No schema or dependency changes.
- All 93 unit tests pass, including 13 brokerage cases and serialized JSON/CSV
  evidence checks. [Captured output](evidence/brokerage-unit-tests.txt).
- Browser file upload, automatic format detection, price mapping, preview, save,
  repeated-file idempotency and unsupported-action rejection were observed.
  The fictional fixture produced $778.97 cash, $1.03 fees and $984.72 wealth.
  The repeated save kept revision 2. Narrow-layout QA reported a 375-pixel
  document and scroll width with expanded receipt details.
- The browser download-event wait timed out; report serialization was instead
  verified locally. No fresh downloaded-file or independent Python portfolio
  verification is claimed. Source compatibility references and full boundaries
  are recorded in [brokerage-import.md](brokerage-import.md).
- Existing Mongo/worker/native integration suites were not rerun: their runtime
  code and dependencies did not change. No remote CI run or GitHub push was made
  for this milestone, following the user's 3–4 milestone batching request.


## GitHub publication and remote CI — September 26, 2026

- Published the complete 243-file project to the private
  [michaelbawuah/MarketLab repository](https://github.com/michaelbawuah/MarketLab),
  on `main`, preserving its initial README commit.
- Initial import commit `2e68e2e8fd46660444f13973559827bee1e262bd` matches local
  source `89b81b7c5c23bad1324c227fc7c0488f92892eff` exactly: every tracked path,
  blob hash and file mode was checked, including 16 binary documentation files.
  Both have tree `c6d705ad1515db6d808c5e707266450a9238e81b`. GitHub and Sites
  retain separate commit histories; this was a complete source snapshot import.
- The first Actions run exposed a Docker health-command quoting error before
  tests began. Commit `c9a19253c846b8694650c4e741494d8978f95705` fixes the quoting.
  [The subsequent run](https://github.com/michaelbawuah/MarketLab/actions/runs/36254911641)
  completed successfully on GitHub's Ubuntu 24.04 runner with Node 24.19.0,
  MongoDB 8.0.17 and the locked pnpm dependencies.
- `pnpm verify:ci` passed type checking, lint and native compilation, followed by
  80 unit, 10 real MongoDB/HTTP/worker integration, 4 native cross-check and 11
  Python verifier tests: 105 tests total. Node suites reported zero skips.
  Independent Python replay matched 66,678 scalar fields in nine fresh reports.
  Integration checks included the clock regressions and actual SIGKILL recovery
  through competing runners with one durable saved result.
- This is remote CI evidence. It does not activate the background service on a
  staging host or rerun browser QA. Earlier sections describe the evidence and
  outstanding work at each earlier milestone, before this GitHub publication.

## Confidence certificates — September 26, 2026

- Certificates and numerical takeaways now appear on Research lab, historical
  portfolio, Quick experiment, demo portfolio and split/dividend reports.
  Research and portfolio previews carry the same evidence structure. Research
  period changes and demo cost selections update the certificate's scope.
- All 80 unit tests pass, including eight certificate cases. Negative cases
  alter wealth, fees, returns, dates, timing and benchmark flow records; the
  relevant check fails and the takeaway changes to a review instruction.
  Type checking and full lint pass.
- The nine-report TypeScript/Python batch matched 66,678 financial fields with
  certificate-bearing JSON exports. Python independently checks financial
  results and input fingerprints, not the truth of certificate prose. The
  existing financial calculation methods and snapshot identities are unchanged.
- Browser QA exercised every hosted report family, unsaved research/portfolio
  previews, certificate details, research full/later-period scope and higher
  demo costs. A 390-pixel iframe gave a 375-pixel content viewport; the expanded
  certificate's scroll width was also 375 pixels. This is layout testing, not
  physical-device testing or a complete accessibility audit.
- Actual browser downloads covered seven paths: research JSON/CSV, portfolio
  JSON/CSV, actions JSON, demo-ledger CSV and Quick experiment JSON. JSON analyses
  and certificates reproduced exactly through TypeScript; observation CSV values
  and certificates matched their JSON counterparts. The demo-ledger CSV's full
  certificate and takeaway were inspected. [Captured results](evidence/confidence-export-checks.txt).
- Python separately replayed the actual higher-cost Quick experiment download
  (1,575 financial fields) and saved Research lab download (678 fields). These
  offline QA receipts are not attached to the application reports; the UI
  truthfully retains “No receipt attached.”
- Native attachment links did not complete reliably in preview QA. Report
  downloads now read the authenticated JSON/CSV response before creating a
  local browser file, show preparation state, reject unexpected/empty responses,
  and surface errors and a 30-second timeout. All seven paths subsequently
  produced the inspected files.
- Completed detailed service exports receive a certificate while preserving
  the existing C++ risk receipt separately. This serializer is unit-tested;
  the unchanged Mongo/worker execution suite was not rerun for this milestone.

See [confidence-certificates.md](confidence-certificates.md) for the complete
scope. No certificate authenticates external data, declares exchange-calendar
completeness, proves trading skill or implies a new independent replay. There is
no remote CI execution, staging activation, new schema or production QA data.

## One-click demo — September 26, 2026

- A new entry on Stock explorer and Research lab opens a fictional cost experiment
  with one click. The canonical TypeScript engine computes all three presets in
  the browser. Its dedicated components perform no fetch or persistence; no
  market-data key, upload or saved experiment is required.
- All 72 unit tests pass, including matching input/configuration invariants,
  exact-cent differences, deterministic replay, synthetic/unsaved export labels
  and recomputation of the fixed fixture hashes. Type checking and full lint pass.
- Independent Python replay matched 66,678 scalar fields across nine freshly
  generated reports, including all three demo presets. The actual browser
  download separately matched all 1,575 fields and matched the canonical
  TypeScript export exactly. Accounting fields require exact equality; floating
  risk metrics retain the documented 1e-10 tolerance.
- Desktop browser QA checked entry, result, higher/zero costs, reset, the 33-row
  exact-value table, download and the link into Historical data. A 390-pixel
  iframe checked the narrow layout; its 375-pixel content viewport had no
  horizontal document overflow. This is responsive-layout testing, not physical
  mobile-device or touchscreen testing.
- Click-to-observed-result measurements were 1,294 ms on desktop and 282 ms in
  the narrow iframe. These include browser automation and accessibility-read
  overhead and are local workflow observations, not a latency benchmark or SLA.
  The result was visible after one click with no intervening setup.
- Browser QA exposed unavailable Web Crypto on the plain-HTTP preview. Fixed
  fixture fingerprints are now generated offline and recomputed in unit tests;
  live demo results still come from the engine, not stored outcome values.

See [the inputs, exact results and evidence images](quick-demo.md). This change
does not activate the background service, change the database schema, or establish
market profitability. The unchanged Mongo/native integration suites were not
rerun for this UI/fixture milestone; their earlier execution is recorded below.

## Engineering roadmap milestones — September 26, 2026

The supplied engineering standards now control priorities; see the
[milestone tracker and directory map](engineering-roadmap.md). Earlier sections
below are historical release records, not a current outstanding-work list.

- Three real MongoDB lease regressions failed against baseline `30b428b6` and
  passed after replacing client-clock ownership checks with database-time atomic
  fencing. Captured before/after outputs and reproduction steps are in
  [reliability-evidence.md](reliability-evidence.md).
- An actual SIGKILL after calculation/before save recovered through natural lease
  expiry and two competing replacement runners: two attempts, one accepted final
  result, exact reference replay, nine native risk checks and stale-token rejection.
- Tests are labeled unit/integration/cross-check. The complete local gate passed
  type checking, full lint, native build, 70 unit + 10 integration + 4 native +
  11 Python tests, and six fresh reports totaling 61,953 Python/TS comparisons.
  No suite was silently skipped.
- The GitHub workflow is written and YAML-checked. It has not executed remotely
  while GitHub publication is paused. No staging background service was activated.

No interface changes were made in this milestone, so prior browser workflow
checks are not represented as new browser testing. Failure checks ran against
temporary local MongoDB data only; production data was untouched.

## Automated checks

The finance test suite covers decimal parsing and cent rounding, fractional shares, exclusion of deposits and withdrawals from return, realized gain and average cost, fee and dividend reconciliation, prevention of overdrafts and short selling, prevention of look-ahead pricing, deterministic dataset generation, complete and unique price records, known sample valuation, API validation, and a large cash-flow edge case.

Commands: `pnpm test`, `pnpm typecheck`, `pnpm lint`, and the production build.

## Browser workflows checked

- First ingestion: 762 validated observations; 762 inserted.
- Second ingestion: 762 validated; zero inserted; no duplicate prices.
- A purchase exceeding available cash was rejected without losing form input.
- A $100 manual deposit changed value and net contributions by $100 without changing investment gain.
- Reloading the page retained that deposit in the transaction ledger.
- Stock search filtered the asset universe.
- The downloaded CSV contained the synthetic-data warning and the saved manual entry.

All browser tests use the local development database. Test transactions and ingestion history are not production seeds. The only built-in seeds are the explicitly labeled sample transactions and deterministic sample prices.

## Limits

The browser preview did not expose `document.modelContext`; live WebMCP tool validation was unavailable. The app feature-detects support and registers a read-only portfolio tool and a workspace navigation tool when supported. Core UI workflows do not depend on this experimental capability.

The initial synthetic-portfolio release had no market-data feed or corporate-action handling; later additions are documented below. MongoDB, strategy backtesting, automatic ingestion schedules and production performance benchmarks remain unimplemented. Its financial outputs describe the synthetic paper portfolio only.

The stock detail dialog and the 1M/6M chart range controls were also checked. The code passed 11 finance/validation tests, type checking, and linting before publication. Responsive styles are included; browser QA in this release used the desktop viewport.

## Historical CSV workspace — September 25, 2026

- 19 automated tests pass: the original 11 finance tests plus eight import/series cases.
- Added cases cover six-decimal preservation, canonical replay identity, correction identity, impossible/future dates, duplicates, non-USD and mixed-symbol rows, malformed CSV, byte/row limits, adjusted-column selection, hand-calculated series change/drawdown, and export formula neutralization.
- TypeScript checking passes. The new additive D1 migration was generated and inspected; no existing tables or applied migrations changed.
- Desktop browser checks: validate the nine-observation fictional example, save it, inspect its chart and source details, reload and reopen it, reject a duplicate date, download a CSV containing exact prices and metadata, upload that exported file, and replay it without creating another dataset.
- Read-only review checked owner-bound list/detail/export queries and the composite key, atomic insertion, workspace quota, and replay behavior.

All browser writes used the local preview database. The new hosted research workspace starts with no imported datasets. No real provider was connected or real market data validated in this release.

## Daily-price provider — September 25, 2026

- 26 automated tests pass, including supported-symbol and credential-method validation, exact provider normalization, metadata mismatches, future observations, safe provider errors, redirect handling, HTTP failures, response limits, network redaction and timeouts.
- A direct request to the official IBM demo returned 100 observations covering May 4–September 24, 2026. The same provider parser validated the response and preserved its refresh date, timezone and exact closing prices.
- Browser checks cover provider controls, the one-time key form, persisted failure history, and server-enforced cooldown with visible countdown.
- An edge-fetch compatibility issue discovered by browser QA was corrected: requests now use manual redirect handling and reject all 3xx responses without following them.

One-time user keys and a configured server key were not tested against a real account; none were supplied. This release does not claim streaming prices, corporate-action accounting, or validation of the provider’s market-data accuracy.

Preview limitation: the supervised preview returned an opaque internal error for its outbound provider request, while a direct HTTPS request and parsing succeeded. The user subsequently supplied a screenshot of the deployed application showing the saved IBM provider dataset: 100 observations, May 4–September 24, 2026, last price $227.06, and the rendered chart. This is user-provided evidence of hosted fetch/save success, not an independently executed production test. No user-key mode was tested.

## Source-declared corporate actions — September 25, 2026

- 32 automated tests pass. Six new tests cover forward/reverse splits, exact fractional shares, ex-date dividend offsets, no reinvestment, same-day split-before-dividend ordering, prior income remaining unchanged by later splits, events between observations, first-date and invalid-date rejection, duplicate events, precision/size limits, adjusted-input rejection, explicit no-event coverage and audit export.
- TypeScript and production build pass. Targeted lint on all new calculation/API/UI/test files passes. Full-project lint still reports six existing React effect/purity findings in `app/market-data.tsx` and `app/provider-connection.tsx`; it is not claimed to pass.
- Read-only review found no blocking calculation, ownership, concurrency or migration issues. API access isolation and stale-revision handling were inspected in code, not exercised with multiple authenticated production users.
- Browser QA imported a six-observation fictional XSPLIT series, entered a 2-for-1 split and a $2 per-share dividend, verified missing coverage confirmation is rejected, previewed and saved events, reloaded the app, and exported the persisted analysis. The result reconciles: raw price -48%, after splits +4%, including cash dividends +8%, two ending shares and $4 of income per initial share.
- Browser QA caught native date inputs failing to retain entered values when another field changed; their input-event handler was corrected and the completed save/reload workflow succeeded.
- The downloaded JSON contains both exact events, all six price observations, revision 1, the no-reinvestment assumption and final indices 52 / 104 / 108.

All new browser test data is confined to the local preview database. Desktop browser QA was performed; responsive styles are included but this release does not claim a mobile browser check. User-supplied historical events have not been independently verified; there is no automatic corporate-action provider, portfolio-ledger integration, or reinvested total-return calculation in this release.

## Historical portfolio bridge — September 25, 2026

- 40 automated tests pass. Eight new tests reconcile a hand-calculated portfolio containing funding, trades, fees, a split, an ex-date dividend receivable and a later payment. They cover ex-date buyer/seller eligibility, payment after complete sale, duplicate/mismatched payment rejection, prevention of spending receivables, exact-date mark failures, adjusted-price rejection, action coverage, reverse-split fractions, aggregate dividend rounding, CSV identity/order/round-trip and frozen-input fingerprints.
- The independent fixture ends with value $1,262, cash $956, shares 6, remaining cost $300.75, realized gain -$1.25, unrealized gain $5.25, earned income $8 and net gain $12. TWR is approximately 0.9397918335% under the declared closing-mark convention.
- Full-project lint, type checking and production build pass. The six earlier React effect/purity lint findings are resolved without disabling lint rules. Dataset selection invalidates stale detail views; provider time reads are synchronized outside rendering.
- Read-only review found no blocking accounting/API issues. Dataset/action lookups bind authenticated owner; preview and save calculate the same input fingerprint; current portfolio replacement uses an atomic owner/revision predicate. The migration adds a new owner-keyed table without rewriting prior tables or applied migrations.
- Desktop browser workflow: empty workspace → full CSV ledger → saved XSPLIT dataset mapping → required completeness confirmation → reconciled preview → save. The separate six-price fictional browser fixture produced value $1,276, cash $964, income $16, shares 6 and gain $26, consistent with its supplied prices/events.
- Browser concurrency check used two tabs loaded at revision 1. One saved revision 2; the older tab's different update was rejected with an explicit conflict. The newer saved portfolio remained intact.
- The downloaded JSON was inspected: revision 2, calculation version `historical-close-v1`, all five ledger rows, six price observations, two full action events, and exact integer-cent results. Save/reload/export use the persisted inputs.

New browser writes remain confined to the local preview database. No user brokerage records were supplied or imported. Multi-user access isolation was inspected in code; the concurrency check exercised one preview identity in two browser tabs. Mobile browser testing and broker-statement reconciliation remain future checks. This release does not add Node services, MongoDB or C++; their intended roles are recorded in `docs/architecture-roadmap.md`.

## Combined research release — September 25, 2026

- 48 automated tests pass. Eight new tests cover next-close SMA execution, causal split normalization, dividend eligibility, nonspendable receivables, final pending signals, fresh-cash chronological evaluation, costs, affordable sizing, reverse-split liquidation, date-grid/coverage rejection, independent risk arithmetic, exact JSON replay and CSV cents.
- The independently derived split/dividend fixture ends at $1,340 for SMA versus $1,220 for buy-and-hold from $1,200. Maximum observed drawdowns are approximately -6.6667% and -22.7273%. The separate 100 bps fee/slippage round-trip fixture ends at $980.10 from $1,020.10.
- Read-only review confirmed metric formulas, event ordering and owner-scoped storage. It found a combined D1 row-size issue: payload and result could individually pass their limits but exceed the database's row limit together. Preview and save now enforce a combined 1,900,000-byte cap before persistence.
- Full-project lint, type checking and the production build are release gates. The new migration is additive; prior migrations and records remain intact.
- Desktop browser QA exercised missing event coverage rejection, saving an explicit no-event record on fictional XDEMO, available-date selection after warmup, preview, immutable save, later-period switching, reload and JSON/CSV downloads. The nine-observation fictional dataset produced a seven-observation full evaluation: SMA ending value $10,640.45, six executions, fees $62.66; the separate three-observation later evaluation ended at $10,076.74 from fresh $10,000 cash. These are QA fixtures, not market evidence.
- The actual downloaded JSON was replayed through the engine: all results matched exactly and its snapshot fingerprint matched the saved run ID. The downloaded CSV matched a regenerated report byte for byte.
- Saved runs contain full price/event payloads and all results, not references to mutable current action records. Up to 30 runs per owner; same-snapshot replay is idempotent. Owner isolation, fingerprint conflicts and atomic count limits were inspected in code; this release does not claim a multi-user production penetration test.

Browser writes remain in the local preview database. No production test datasets or experiments were inserted. Mobile browser QA, automatic authoritative corporate actions, cash-flow-matched portfolio benchmarking, liquidity/survivorship controls and Node/MongoDB/C++ infrastructure remain outstanding. Risk is per observed interval with no annualization. This fixed-rule research release does not claim strategy profitability or predictive validity.

## Node / MongoDB / C++ infrastructure — September 25, 2026

- Existing 48 finance tests pass. Six native/worker integration tests and five real MongoDB/service integration tests also pass (59 tests across the three suites; Mongo/native suites are explicit commands rather than silently skipped default tests).
- C++ was compiled with GCC 13.3.0, C++17, Node-API 8, optimization enabled and fast-math/FMA contraction disabled. Parity covers independent positive/inverse/flat fixtures, 100 deterministic paths, scale changes, near-zero variance, offset typed arrays, shared-buffer rejection, invalid values, nonfinite reference rejection, all nine full-run comparisons and worker timeout/replacement.
- MongoDB 8.0.17 was downloaded from its official distribution and verified against its published SHA-256 (fe7bccea2ac1eed16867e9ae5a60481455ee30796f285fe67d0d02a6c2abbdda). Tests launch an actual disposable loopback server and exercise the installed mongodb 7.6.0 driver. This is not a mocked database or in-memory adapter.
- Twenty concurrent identical submissions persist one job. Forty concurrent distinct submissions persist exactly 30 jobs. Database schema rejects slot 30, another owner cannot retrieve a job, expired leases recover through a fresh database connection, old workers cannot heartbeat/fail/commit over the current token, terminal results resist a second completion, and third-attempt exhaustion fails the job.
- Signed HTTP integration submits a snapshot, completes it through a real persistent worker pool plus native verifier, and reads an exact TypeScript result from MongoDB. The trusted CLI also submits an exported experiment and writes the exact completed result. Body tampering, expired signatures, replayed nonces, another owner and malformed snapshots are rejected. Same-input resubmission returns the completed job without duplication. Provider snapshot identity binds its frozen refresh date and timezone.
- Reviews identified and fixed three issues before release: missing Mongo operation deadlines/overlapping heartbeats, missing dataset-content hash validation at the import boundary, and native parity checks accepting nonfinite reference metrics. Targeted regression checks cover the latter two; Mongo uses five-second client operation deadlines.
- The benchmark artifact records warmed kernel timing, packing overhead, full calculation/worker timing and separate-process peak RSS. The measured approximately 3.1× direct kernel ratio is not an application acceleration claim. Canonical accounting remains TypeScript; native verification adds a cross-check.
- The optional hosted gateway signs the authenticated owner's saved snapshot, uses bounded HTTPS calls and exposes only safe job summaries to the UI. With no configured service URL/secret it returns unavailable and makes no external request. Production secrets have not been configured and existing D1 ownership remains unchanged.
- Desktop browser compatibility QA reopened the existing fictional XDEMO experiment with the service unconfigured. Its saved results, chart, evaluation controls and report links remain available; the optional background-verification panel stays hidden.

The standalone Node process and native build were tested on Linux, not macOS. Docker/Compose is provided but not executed because Docker is unavailable here. Real production hosting, TLS, authenticated Mongo credentials/roles, database backup/restore, retention/deletion UI, production load/fault tests and the enabled remote browser flow remain activation/hardening work. No external paid infrastructure, production MongoDB database, production test records or user-data migration was created.

## Cash-flow portfolio comparison and Python replay — September 25, 2026

- 58 TypeScript finance tests pass: the existing 48 plus ten benchmark cases. The new cases cover independently calculated funding/split/dividend paths, excluding internal transactions, between-observation events, same-date order, cent liquidation, unspendable entitlements, invalid coverage, sub-cent valuation rejection, bounded audit size, legacy identity and exact CSV fields.
- A supporting Python 3.11+ implementation independently replays all nine Research lab simulations. Its 11 tests pass, including hand-calculated cents/shares/trades, causal signal timing, fresh holdout funds, rounded affordability, risk values, strict JSON parsing and tampered-report rejection.
- Cross-language checks generated six current TypeScript reports and matched 61,953 scalar fields with Python: five small frozen scenarios plus 2,500 supplied observations with the maximum 500-observation SMA. Exact accounting fields require exact equality; floating metrics use absolute/relative 1e-10 tolerance. The verifier does not call TypeScript during its own replay. It supports Research lab/service exports, not historical portfolio reports.
- Review caught two benchmark issues before publication: positive fractional holdings rounding to zero could report a permanent total loss, and a synthetic benchmark was omitted from the combined chart's input classification. Such sub-cent comparisons now fail clearly; combined chart classification includes the benchmark. A separate 1 MiB incremental audit budget prevents large rational-share histories from accumulating unbounded responses.
- Desktop browser QA imported four fictional XBENCH closes, declared a 2-for-1 split and a $1 cash dividend, mapped a six-row ledger, selected the benchmark, previewed, saved and reopened the portfolio after reload. The actual portfolio ends at $1,038, with $1,004 net contributions, $34 gain and 3.3860418744% TWR. The comparator ends at $1,124 with $24 receivables, $120 gain and 11.9521912351% TWR. The difference is -$86 and approximately -8.5661493607 percentage points.
- Both downloaded files were inspected. JSON format `marketlab-portfolio-v2` contains the complete frozen benchmark dataset/events, method and assumptions; its fingerprint and recomputed portfolio/comparison match exactly. The downloaded observations CSV matches regenerated output byte for byte. Existing unbenchmarked exports retain v1 format.
- All dataset/action loads use authenticated ownership. The optional binding is inside the existing frozen portfolio payload, with the same preview fingerprint and revision concurrency check; no schema migration or existing record rewrite is needed. Ownership was reviewed in code, not tested with multiple production users.

New browser records exist only in the local preview. The production Node/Mongo connection remains unconfigured. This batch does not add automatic event feeds, scheduled ingestion, broker integration, or independent verification of source authenticity. Python is offline supporting verification, not the app runtime. Desktop browser QA was performed; mobile browser testing remains outstanding. Native/Mongo service tests from the previous release were not rerun because their implementation and dependencies were unchanged.

## Provider-backed Stock explorer — September 25, 2026

- 60 TypeScript finance tests pass. Two added cases exclude uploader claims, synthetic observations and other price bases from the provider explorer, and verify newest-observation selection with stable timestamp/fingerprint ties. TypeScript and lint pass.
- Stock explorer is now the default screen and reads only authenticated owner-held provider snapshots. Missing symbols have no quoted price. Newest observation date takes precedence over import time; changes identify both compared observation dates. Dataset navigation opens the exact selected snapshot. The existing provider parser, persistence routes and ownership boundaries are unchanged.
- Desktop browser QA checked the unfetched state, symbol selection, NVDA key dialog preselection, explicit demo navigation/banner, the original NVDA simulated-price modal, a populated IBM chart, source/as-of labels, and the exact Historical data link. Existing local fictional XBENCH research data did not appear as a provider symbol.
- The preview Worker's outbound IBM request failed with the existing safe network error and recorded failed status/cooldown; no substitute price appeared. A separate HTTPS request from the execution workspace successfully fetched the official public IBM response (100 observations ending September 24, 2026, close $227.06). That exact response passed the production normalizer and canonical fingerprint calculation, then was inserted only into the local preview database for populated-state UI QA. Its fingerprint is `b8ca2f12caefb5e5447959c76c7fc07fe125a037626c7502455069bc69805000`. This is not a successful end-to-end preview Worker fetch, and no production test records were created.
- The populated explorer showed the $227.06 close, September 24 observation date, -2.45% change from September 23, the provider timezone, and the matching fingerprint after navigation to Historical data. Screenshot: `docs/market-prices-preview.jpg`.

NVDA and other non-IBM symbols still require a user's provider key or configured server key and provider entitlement. No key was supplied in this batch. Quotes remain saved daily closes, not streaming prices; no automatic refresh or demo-ledger revaluation was added. Desktop browser QA only; mobile device testing remains outstanding. Accounting, C++/Mongo service and Python verifier implementations were unchanged and their separate integration suites were not rerun.

## Provider failure diagnostics — September 25, 2026

The user's NVDA screenshot exposed an ambiguous message: MarketLab's 60-second per-owner cooldown was shown as “Ready in”, next to an upstream rate-limit error. It is now labeled “App cooldown” and explains that provider quota recovery is independent. The cleared one-time key field also has an explicit retry reminder after errors.

A read-only review found that the old unbounded `/rate/` classifier could match words such as “generated” and that access failures mentioning rate limits could be mislabeled. Explicit invalid-key and premium-endpoint rejections now take precedence; quota detection uses complete rate/frequency phrases. HTTP 429 and detected quota notices report that MarketLab does not know the provider reset time. Errors remain fixed strings with no provider payload/key disclosure. Two additional regression tests pass, bringing the finance suite to 62.

The screenshot does not establish the user's actual quota usage or which upstream response generated the old message. No private API key was provided to the assistant and no successful NVDA request is claimed. Provider documentation checked this date lists a standard free allowance of 25 requests/day: https://www.alphavantage.co/support/ . These changes improve classification and guidance; they do not change provider entitlement, increase allowances or retry requests automatically.

Type checking and lint pass. Desktop preview QA confirmed the updated dialog explanation while preserving the saved IBM view. The provider-response distinctions are tested with bounded mock responses; no additional real API request or private-key submission was made during this fix. Screenshot: `docs/provider-guidance-preview.jpg`.


## Saved experiment comparison — 2026-09-26

- Added side-by-side inspection of frozen experiments across full, earlier and later periods, including signed exact-cent wealth/fee differences.
- Fourteen focused research tests pass: six comparison cases plus eight existing engine cases. Coverage includes exact interior date grids, changed action contents under the same dataset ID, different cash/method/boundaries, name-only changes, cost variations and independent segment selection.
- TypeScript checking passed. Read-only source review found no blocking issues.
- Browser checks used an explicitly fictional 20-observation XCOMPARE dataset in local preview only: zero-run entry, single-run disabled comparison, two saved runs (SMA 3 and SMA 5), selection, full/later period switching and clearing. The full-period comparison displayed +5.35 pp and +$535.36; the later period displayed zero differences. These are fixture outputs, not market-performance claims.
- Fixed a duplicate React sibling key observed during browser checking. Desktop comparison captured in `docs/experiment-comparison.jpg`. Mobile layout uses wrapping controls and horizontally scrollable tables; device emulation was not performed.
- No database schema or existing saved experiment was changed. Test datasets and runs remain local and are excluded from published artifacts.

## Read-only summaries and equity-curve events — September 26, 2026

Milestones 9–10 are implemented with [detailed acceptance evidence and current
activation limits](research-sharing-and-events.md). The complete local gate
passed 144 tests (113 unit, 16 integration, 4 native, 11 Python), 66,678 independent
TypeScript/Python comparisons and 54 built-Worker HTTP/header/content assertions.
The Worker tests use disposable D1 and fictional fixtures, including both enabled
and disabled public-sharing configuration. No production share was created.

The Site audience remains owner-private, and public report sharing is disabled
by default. The owner can review the redacted summary. Anonymous live-link
activation needs approval and verification through the real Sites dispatcher;
it is not claimed complete by these local tests. Event markers are implemented
for saved Research lab experiments and shared summaries. Existing UI screenshots
were inspected, and narrow-screen label sizing was corrected. The final chart
change received type/lint/build and Worker checks, without a new browser session.

## Public sharing activation — September 26, 2026

The user approved public report routing while retaining an owner-only workspace.
Sites applied public audience revision 2 and deployed the sharing activation flag
in runtime revision 3. A read-only `/example` page uses the existing deterministic
XDEMO teaching fixture. It does not read or create personal workspace data and is
clearly distinguished from an owner's expiring, revocable report link.

Type checking, lint and a fresh build passed for the example. The built Worker
passed 58 HTTP/header/content assertions, including example activation and
private fixture exclusion. GitHub run `36270031533` exposed an intermittent 503
from Wrangler's development proxy during a rejected POST. The HTTP harness now
drains every response body and sends each assertion on a fresh connection, so
early rejected requests cannot leave a reused connection for the next check.
No assertions were relaxed and no requests are retried. Two consecutive local
runs passed all 58 checks after this adjustment. Captured output:
`docs/evidence/public-sharing-activation-local.txt`. The unchanged calculation,
MongoDB and independent replay suites retain their previous 144-test/66,678-field
checkpoint; the standard remote gate reruns them on the GitHub checkpoint.

Direct anonymous live requests from this workspace returned edge HTTP 403/1010
for the root and private APIs; web retrieval was also unavailable. This is a
hosting-side automation restriction, not evidence that the Worker returned its
expected 401 or that an owner-created link works in a live browser. Actual
browser verification remains outstanding. No identity bypass, production test
record or personal report publication was used. Node/MongoDB staging remains
unprovisioned and requires a real external Node host and persistent authenticated
MongoDB, TLS and matching server-side signing secrets.

## Provider response diagnostics — September 26, 2026

The user reported that a new Alpha Vantage key still failed for NVDA. Production
logs confirm an application HTTP 429 at `2026-09-27T00:42:19.340Z` (September 26
in New York), but contain no upstream body or upstream status. That application
status cannot prove the account's remaining allowance. The request-only key is
forwarded independently of the optional server key; missing server configuration
is not the cause of a valid one-time-key request.

New provider failures return the observed upstream status and bounded notice
fields to the authenticated owner. The submitted key is removed before any
truncation; links, email addresses, credential assignments and control characters
are removed too. Arbitrary response fields are excluded. The interface shows
these details and offers Copy diagnostic. Provider text is not stored in the
database, application logs or browser storage. At this checkpoint the provider's
actual explanation still required a fresh request; the next record captures
the subsequently supplied diagnostic and direct-request result.

All 118 unit tests pass, including 14 provider tests covering key forwarding,
HTTP-200 notices versus HTTP-429 responses, redaction before truncation, access
denials and malformed bodies. Type checking, lint and the app build pass. Two
consecutive built-Worker runs pass 66 HTTP/header/content assertions. Eight new
assertions cover owner-only provider diagnostics, cross-origin rejection,
submitted-key exclusion and absence of provider text from saved history. The
external provider response in this test is stubbed with a fictional key; this
is not successful live Alpha Vantage access.

The earlier connection-close workaround did not eliminate Wrangler's intermittent
development-proxy 503. The harness now runs the same compiled modules and assets
directly in Miniflare/workerd, with real HTTP requests and disposable D1. Its
Miniflare version is the same version already locked under Wrangler, now declared
as a direct development dependency. No existing assertion is relaxed or retried.
Captured output: `docs/evidence/provider-response-diagnostics-local.txt`.

## Direct browser provider connection — September 26, 2026

The user supplied two different observed outcomes. The 9:11 PM New York
screenshot showed NVDA's hosted request returning HTTP 200 with a `Note` about
the standard 25-request daily allowance. The 9:20 PM screenshot, after the user
was instructed to request the same endpoint directly with the same key, showed
NVDA `Time Series (Daily)`, `Compact`, `US/Eastern`, refreshed September 25.
This establishes successful direct retrieval at that time, not the exact cause
of the earlier notice, a remaining quota, or a proven shared-IP restriction.

An actual public IBM demo request with MarketLab's Origin returned HTTP 200,
`Access-Control-Allow-Origin: *`, and 100 observations refreshed September 25.
Its captured body passed the production normalizer and browser-transfer
validator. That is a provider CORS/header and parsing check, not a full browser
execution or live private-key NVDA save.

The one-time-key interface now reserves an owner request, calls Alpha Vantage
once directly from the browser, and submits only projected dates, closes and
refresh metadata. The key never goes to MarketLab's server on this path.
Cookies/referrers are omitted and redirects rejected. Provider errors retain
local redacted diagnostics; only a fixed failure marker reaches saved history.
No automatic retry, hosted fallback, proxy rotation or quota reset is added.
The existing server/demo path and new browser path share the same atomic
60-second per-owner cooldown, including failures. Completion is owner-bound,
expires in five minutes and is claimed atomically against replay/concurrency.
No schema or production dataset changes are required by deployment.

Server validation assigns `alphavantage-browser` provenance; it cannot verify
the authenticity of a response supplied by the browser. Stock cards, dataset
details, CSV exports, confidence certificates and the TypeScript/Python replay
preserve this distinction. Its origin is included in the frozen dataset hash;
existing server and CSV identities are unchanged.

Local results: type checking, lint and production build passed; 125 unit tests,
11 Python verifier tests, 67,044 scalar comparisons across 10 freshly computed
reports, and 94 built-Worker HTTP/header/content assertions passed. The 28 added
Worker assertions exercise reservation authorization, a shared cooldown in both
directions, strict transfer validation, owner isolation, concurrent completion,
replay rejection, correct saved decimals/origin and expired requests. These
tests use fictional inputs and isolated D1. Captured output is in
`docs/evidence/browser-provider-connection-local.txt`.

The managed preview requires a control-browser skill unavailable in this
session, so no browser UI execution was performed. Final live acceptance remains
the user's NVDA fetch and save in the updated app; the screenshot alone shows
direct provider retrieval, not that final integration step. The remote release
gate is checked separately after the GitHub checkpoint. Node/MongoDB staging
and the live public-sharing browser lifecycle remain outstanding.

## Live NVDA acceptance and staging preparation — September 27, 2026

The user's September 26 9:43 PM New York screenshot and "finally" confirm the
missing application step: NVDA is saved and visible in the market card/chart,
with May 5–September 25 history, a $225.07 latest saved close and
`Alpha Vantage · browser import` provenance. This supersedes the pending NVDA
acceptance above. It establishes that observed fetch/save, not the cause of the
earlier provider restriction or future quota availability. The deployed browser
fix is Site v22, source `b5e5da9`, corresponding GitHub checkpoint `3f21641`.
[Actions run 36285974577](https://github.com/michaelbawuah/MarketLab/actions/runs/36285974577)
passed 125 unit, 16 integration, four native and 11 Python tests, 67,044 scalar
comparisons across 10 reports, and 94 built-Worker assertions.

For milestone 11, the service image now pins Node 24.19.0, preserves the project's
dependency-install policy, records its source revision, runs as `node`, includes
an HTTP health check and honors the host's `PORT`. Compose now uses an init
process. An operator-only acceptance command tests authenticated HTTP/native
parity, owner isolation and idempotent replay, then kills a separate runner
after calculation and verifies recovery through Mongo's natural lease expiry.
Randomly prefixed collections prevent the live runner from claiming the crash
fixture; cleanup is limited to those collections and that run's random owner.
Staging requires HTTPS and the real 60-second lease; CI uses a one-second lease.
Passing receipts include source/addon hashes, revision, result counts and scope.

Local type checking, lint and all 127 unit tests pass, including hosting-port
precedence and acceptance collection isolation. Docker and MongoDB executables
are unavailable in this workspace. The new `Research container acceptance`
workflow will build and exercise the image with authenticated MongoDB in CI;
its remote result is checked after publication. The existing full engineering
workflow remains required. These are separate from a real persistent staging
deployment, which is not yet provisioned. The [runbook](research-staging.md)
records deployment settings, remote acceptance and remaining account/cost access.
No website UI change or gateway activation is included in this checkpoint.

## Real staging recovery — September 27, 2026

The preparation checkpoint `84bd1a86c50b27e55195c3c0b9221c1edd84d83d` passed
both remote gates: [engineering](https://github.com/michaelbawuah/MarketLab/actions/runs/36287597610)
and [container acceptance](https://github.com/michaelbawuah/MarketLab/actions/runs/36287597512).
The container CI result has a one-second lease and remains distinct from the
subsequent real host run.

Railway's `MarketLab staging` project now runs the research image and MongoDB
8.0.17 with authenticated private networking and a 500 MB `/data/db` volume.
The default environment is named `production`; its actual purpose is staging.
The user authorized the free trial only. GitHub App access was repaired in the
user's own browser after the cloud browser failed. The initial image built
successfully but startup hit Mongo error 14031 (`OutOfDiskSpace`): the default
500 MB index-build reserve exceeded the mounted volume's available 224 MiB.
A staging-only 50 MB reserve resolved startup without a plan upgrade.

The [staging receipt](evidence/research-staging-2026-09-27-receipt.json) was
produced inside Railway deployment `6b3af02f-a130-4edd-8053-1f62158013d0`, using
the unchanged production image and operator acceptance command. The temporary
start wrapper ran the ordinary API alongside the check and printed the passing
receipt for retrieval; it did not add a public testing endpoint. The run lasted
60,977 ms and passed public HTTPS, unsigned rejection, signed synthetic
submission, owner isolation, idempotent replay and all nine native comparisons.
SIGKILL after calculation was followed by natural 60-second lease expiry and
two competing replacement runners. Attempt two produced one accepted durable
finalization and one stored result. Stale mutations were rejected, a fresh
Mongo client read the same result, and all isolated test data was cleaned up.

The [deployment record](evidence/research-staging-2026-09-27-deployment.json)
preserves the image/config/base digests, source revision, service/volume IDs,
safe configuration and limits. Five TypeScript hashes in the remote receipt
match this checkout. Normal startup was restored in successful deployment
`fcecb36c-708e-429a-a732-c0b1d9ab9aeb`; its resolved image digest is unchanged.
No runtime application code changed to obtain this result. Documentation and
evidence are the only source edits in this checkpoint.

After acceptance, the matching server-only gateway variables were configured
in Site environment revision 4 for publication. The owner's live Background
verification click remains pending. This proves a hosted runner-process crash
recovery, not exactly-once computation, backup restore, replica failover,
database-host-loss recovery or indefinite trial availability. Milestone 11 is
complete within that scope. The subsequent browser result and collaboration
decision are recorded below.

## Live saved-experiment browser result — September 27, 2026

The owner's 8:48–8:52 AM America/New_York screenshots show the saved
`NVDA SMA 20 verification` experiment and then successful Background verification:
"Recomputed from the saved inputs. All 9 native risk comparisons passed."
The report covers 80 observations from June 3 through September 25 and reports
five internal consistency checks passed. This confirms the owner's live
save → server gateway → Railway recomputation → status display flow. It does
not attach an independent Python replay receipt to the confidence certificate;
that separate status still reads "No receipt attached."

The user subsequently approved invite-only comments for milestone 12. The
four explicit visibility, revocation, identity and audit rules are documented
in [research collaboration](research-collaboration.md).

## Collaboration acceptance checkpoint — September 27, 2026

The invite-only comments implementation passed 174 built-Worker assertions,
including account binding, concurrent acceptance, revoked access, moderation
and append-only audit behavior. The simplified invitation/discussion release
`67b51bc` passed both remote gates:
[Engineering verification](https://github.com/michaelbawuah/MarketLab/actions/runs/36322756945)
and [Research container acceptance](https://github.com/michaelbawuah/MarketLab/actions/runs/36322756985).
It is live as Site version 25.

The owner's earlier mobile screenshots confirm their own sign-in and comment.
At 9:38 AM America/New_York, after being given the fresh-invitation,
separate-account comment and revocation checklist, the user replied,
"done, looks good." Milestone 12 is accepted on this user-reported two-person
check plus the automated evidence. No second-account screenshot or production
audit extract was supplied for independent inspection. See the
[collaboration record](research-collaboration.md) for the precise scope.

This checkpoint updates documentation only. The existing public-link lifecycle
check, real customer brokerage-import evidence and unattached independent Python
receipt retain their separate recorded status. No financial calculation,
authorization rule, runtime configuration or service deployment changed.
# September 28: attached independent Python replay

The owner-triggered saved-report replay and receipt flow is implemented; see
[binding and product behavior](independent-replay.md). The complete local
`pnpm test:service:local --ci` gate passed against disposable MongoDB 8.0.17:
type checking, lint, native build, 130 unit tests, 19 integration tests,
4 native cross-check tests, 11 Python rejection tests, 10 freshly generated
reports with 67,044 scalar comparisons, production build and 274 built-Worker
HTTP/header/content assertions. Tests used fictional inputs only.

The new tests execute the real Python process, signed service HTTP endpoint
and generated D1 schema. Worker transport is mocked, with its streamed request
body checked against the exact report actually replayed in Python. Earlier
local attempts exposed two harness issues: changing a private source label
required recomputing its dataset ID, and the mock receives a ReadableStream
rather than a string. Those fixtures were corrected; application validation
was preserved, and the final complete gate passed.

Publication, remote CI and the owner's live replay click are distinct evidence.
At this source checkpoint remote verification is pending. The separate
public-link anonymous browser lifecycle remains outstanding. No new browser
QA was claimed; managed preview browser control was unavailable in this turn.
