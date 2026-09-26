# MarketLab

A JavaScript/TypeScript portfolio research workspace with auditable transaction accounting, historical valuation, and a reproducible price-ingestion pipeline.

**Engineering direction:** follow the adopted [engineering roadmap](docs/engineering-roadmap.md), based on Michael's supplied standards. It includes the directory map, ordered milestones and observed status. The first reliability work now has [reproducible clock-race and process-crash evidence](docs/reliability-evidence.md).

**Current release:** a private research workspace opening on provider-backed Stock explorer, with on-demand Alpha Vantage daily-price fetching, historical CSV imports, split/dividend research, user-imported historical portfolios with cash-flow-matched benchmarks, saved strategy experiments with benchmark/risk comparisons, and a separate synthetic portfolio demo. The separate demo’s six price series are explicitly synthetic, covering 127 weekday observations from April 1 to September 24, 2026. They are not real market history, exchange calendars, forecasts, or a backtest.

## What works

- Confidence certificates and plain-language takeaways on analytical reports, with source/coverage details, actual per-result consistency checks, assumptions and explicit independent-replay status. JSON/CSV reports carry the certificate. [Scope and evidence](docs/confidence-certificates.md).

- A one-click **Quick experiment**: compare the same fictional rule and prices with three cost settings, inspect exact values and download a reproducible report. No upload or market-data key is required. [Demo inputs and acceptance evidence](docs/quick-demo.md).

- Side-by-side saved-experiment comparisons in Research lab, with exact-cent differences and explicit checks for matching frozen prices, event records, starting cash and observation dates.

- Cash-flow-matched portfolio benchmarks with frozen price/event inputs, exact fractional holdings, observed return comparisons and JSON/CSV exports.
- A supporting Python verifier that independently replays Research lab reports and checks exact accounting, signals, trades, risk metrics and input fingerprints.

- A locally verified Node/MongoDB research job service with signed ownership, concurrency-safe quotas, crash recovery, bounded worker threads and C++ risk parity checks. Its hosted connection is optional and currently unconfigured.

- A Research lab with next-close SMA backtests, costs, buy-and-hold and selected benchmark comparisons, observed-interval risk, separate chronological evaluation and immutable JSON/CSV reports.

- An Alpha Vantage daily-price connector with IBM public demo access, request-only API keys, bounded fetching, persisted request history, and source-aware snapshots.
- A historical-data workspace with CSV validation, preview, persistent immutable snapshots, price charts, observed declines, coverage details, and CSV export.
- Saved, source-declared split/dividend event records with exact fractional-share arithmetic, cash-inclusive performance comparison and an audit export.
- An empty historical portfolio workspace with full-ledger CSV imports, exact-date price bindings, frozen data/event inputs, dividend receivable/payment accounting, reconciliation and export.
- A sample portfolio dashboard with value history, contribution overlays, time-weighted returns, allocation, and holdings.
- Search and price charts for six sample assets.
- Server-persisted buy, sell, deposit, withdrawal, and dividend entries, including trade fees and fractional shares.
- Historical cash and position validation: an entry cannot create negative cash or a short position, including on earlier dates.
- An append-only manual ledger with request idempotency and an atomic revision check for concurrent writes.
- A dataset ingestion endpoint with validation, immutable dataset identity, unique symbol/date keys, resumable batches, and persisted run outcomes.
- A downloadable CSV report containing dataset provenance, valuations, costs, and the full ledger.
- Per-user ledger and run isolation using the hosting platform's authenticated user ID.

The first portfolio is intentionally a paper account. The built-in ledger is immutable; up to 500 additional manual events are supported. There is no brokerage connection, execution, or money transfer.

## Technology

| Area | Implemented |
| --- | --- |
| Interface | React 19, TypeScript, custom SVG charts, Shadcn primitives |
| Application server | TypeScript route handlers on a Cloudflare-compatible Worker |
| Persistence | Managed D1 / SQLite, schema migrations generated with Drizzle |
| Accounting | Pure TypeScript; integer cents and millionths of shares using BigInt |
| Validation | Zod request validation plus historical ledger replay |
| Verification | Node finance/integration tests, independent Python replay, TypeScript checking, ESLint and browser workflow checks |

Node runs local tooling and tests. A separate signed Node research service now persists jobs and results in MongoDB, computes through worker threads, and verifies risk metrics with a compiled C++ Node-API module. It is locally verified; its production host/database are not configured. The live website continues to use Workers + D1. See `docs/research-service.md` for setup, deployment boundaries and benchmarks.

## Run and check

Use Node 24 for the complete engineering gate and the checked-in pnpm lockfile.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm dev
```

`pnpm test` runs the unit layer. With a C++17 compiler, Python 3.11+ and `mongod`
installed, `pnpm test:service:local --ci` runs the complete verification gate
against a disposable database. Set `MONGOD_BIN` when needed. The gate includes
real HTTP/worker/crash tests and independent Python/C++ comparisons. See the
[test layers and focused commands](tests/README.md). The
[GitHub workflow](https://github.com/michaelbawuah/MarketLab/actions/workflows/verify.yml)
runs this same gate on pushes and pull requests; inspect its run result for remote
verification evidence.

For a standalone local environment, the starter's execution-profile helper configures the development server. This repository was created in the managed Sites environment; managed preview uses `sites-preview start` instead of launching an additional server. Generate database migrations with `pnpm db:generate`, build to generate the local Worker config, and apply pending SQL migrations to the local D1 database using Wrangler. See `docs/runtime.md` for the runtime setup and migration command.

## Accounting conventions

Amounts crossing the API and stored in the ledger are integer strings. No financial amount is parsed with JavaScript's floating-point `parseFloat`. A share has six decimal places; a currency amount has two. Share-price products are rounded half up to the nearest cent. Final display values and dimensionless performance ratios use Number.

Cost basis is weighted-average acquisition cost, including buy fees. Partial sales allocate cost proportionally; a final sale takes the exact remaining basis. Realized gain deducts sell fees. This is a research convention, not tax-lot accounting.

Valuation uses only the latest quote dated on or before the observation. Missing initial prices stop valuation. Daily close prices mark existing holdings first; that date's ledger events then execute in stable order. Return chains each market movement and each internal ledger event. Deposits and withdrawals change value without changing return. Fees, execution prices, and dividends affect return. Same-day event order and the close-price timing assumption matter; this is not intraday-accurate performance measurement.

The demo's weekday calendar intentionally includes weekdays that may be exchange holidays. No holiday-calendar accuracy is claimed. The synthetic portfolio ledger does not apply corporate actions. Separate historical research supports the explicit model below. Foreign exchange, shorting, leverage, and multi-account support are not implemented. Historical portfolios support the separate cash-flow benchmark model documented below.

## Pipeline behavior

`POST /api/pipeline` validates all 762 records, then stores batches of 50 with unique `(dataset, symbol, date)` keys. Running it again leaves the same number of rows. Completed and failed runs retain actual counts and elapsed times. Interrupted batches can be resumed by replay; there is no automatic scheduler or retry queue yet. Dataset version IDs must change if fixture values change.

Before ingestion, the UI uses the explicitly labeled fixture preview. After ingestion, calculations read the stored dataset. Partial persisted coverage fails closed; the Data pipeline view remains available to repair it with another ingestion. Prices are shared immutable fixtures; manual transactions and run history are scoped to the signed-in user.

## Historical CSV research

Open **Historical data** to upload or paste a daily USD price series. The importer accepts `date` (or `timestamp`) with `close`, or an explicitly selected `adjusted_close` / `Adj Close` column. An optional `symbol` column must match the selected symbol; an optional `currency` column must be USD. Choose the source name, historical versus synthetic classification, and adjustment basis explicitly. Unknown adjustments are supported and labeled.

Imports are limited to 256 KiB, 2–2,500 observations, one symbol, and 30 saved datasets per user. Prices use integer millionths of a dollar, preserving up to six decimal places. Invalid dates, future observations, duplicate dates, mixed symbols, non-USD currency and invalid or over-precision prices fail validation before saving. Missing exchange sessions are not invented or declared complete.

Each canonical dataset includes the metadata and sorted exact observations in its SHA-256 identity. Equivalent replays preserve the original snapshot; changed prices or metadata produce another snapshot. Each bounded snapshot is stored as normalized metadata plus a canonical JSON observation vector in one owner-scoped D1 row. A single SQL statement enforces the workspace limit and atomically inserts the whole snapshot, so partial imports are never visible. The raw uploaded file and unused columns are not retained. Original canonical observations are available in the export.

Source, symbol and adjustment claims come from the uploader and are not independently authenticated. Charts show only supplied observations, with lines connecting them across gaps. Series change and maximum observed peak-to-trough decline use the declared price basis. They are not portfolio returns, intraday risk measures, or strategy results. Imports never replace synthetic portfolio marks or use the demo's fictional trade ledger. The Alpha Vantage connector below can fetch directly from the provider; CSV uploads keep their user-supplied classification.

## Daily-price provider

**Stock explorer** is the default view. **Fetch IBM · public access** requests the documented public IBM endpoint. Select another card and use **Fetch [symbol] with a key** for AAPL, AMZN, GOOGL, IBM, MSFT, NVDA or SPY. The same connector remains in Historical data. This intentionally small US/USD universe avoids inferring currency from arbitrary tickers: the daily endpoint has no currency field.

Stock explorer reads the existing owner-scoped dataset APIs. It admits only server-stamped Alpha Vantage historical unadjusted-close snapshots, choosing the newest observation date for each supported symbol, then save time and fingerprint to break ties. Reload saved prices makes no provider request. Missing symbols show no price; there is no synthetic fallback. A failed reload retains previously loaded snapshots and their dates. The card and chart link to the exact dataset and provenance; request-history links open their exact snapshot even when a newer one exists. Latest change compares the two last supplied observations, displays both dates, and excludes dividends.

Demo portfolio, transactions and pipeline now sit under **Demo · Fictional data**. Their dialog and transaction controls explicitly identify simulated prices and demo records. Real provider prices never revalue the demo ledger.

The connector calls Alpha Vantage `TIME_SERIES_DAILY` with its default compact output (up to 100 recent observations), preserves exact closing prices, provider refresh date and timezone, and labels all observations unadjusted. This is on-demand daily historical data, not a streaming feed. It does not infer exchange-calendar completeness, intraday freshness, total return or split corrections. Provider demo availability and account entitlements remain controlled by Alpha Vantage.

A one-time key travels in a same-origin POST request and then only to the fixed Alpha Vantage HTTPS endpoint. It is cleared from the UI after submission and never written to browser storage, datasets, run history or application logs. An optional `ALPHA_VANTAGE_API_KEY` server secret supports a configured connection. Production secrets belong in Sites; `.env.example` contains only the empty local setting.

Requests have a 20-second timeout, a 128 KiB response cap, redirect rejection and strict response validation. Provider notices are mapped to fixed errors instead of returning messages that could echo keys. A database reservation atomically enforces a one-minute per-user cooldown. There is no automatic polling or retry. Already saved data is read locally without another provider call; repeating an unchanged response reuses the same snapshot. Changes create a new immutable snapshot.

The server records provider origin separately from CSV claims. Provider identities use a separate hash namespace while all existing CSV identities remain stable. Completed and failed requests retain timestamps, symbols, credential method (never the key), counts and safe messages. If execution ends before finalization, an old running entry is shown as unfinished; a run-history failure does not falsely report successfully saved data as lost. The workspace retains the 30-dataset limit.

Provider contract references: [Alpha Vantage daily API documentation](https://www.alphavantage.co/documentation/#daily), [public IBM example](https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=IBM&apikey=demo), [provider access and rate limits](https://www.alphavantage.co/support/).

## Splits and cash dividends

In **Historical data → Splits & dividends**, add an event record to an unadjusted close dataset. Give the event source, split effective dates with new/old whole-share ratios, and cash-dividend ex-dates with USD per post-split share. Confirm complete coverage of the period after the first close through the last close, including an explicit empty list if there were no events. Corporate actions are manually supplied; the daily-price connector does not fetch them. Records cannot be applied to adjusted or unknown-price datasets.

The model starts with one share at the first supplied close. A split multiplies the holding by new/old while original acquisition cost stays constant. Shares and dividend amounts use reduced BigInt fractions, retaining reverse-split fractional shares exactly. A dividend adds the then-held share count times the declared per-share amount to a cash receivable on ex-date. That receivable earns no interest and is not reinvested. Same-date splits precede dividends, which must be specified per post-split share. First-date events are excluded because the modeled holding begins at that close.

The chart compares raw price, split-aware holding value, and holding value plus accumulated dividends, each rebased to 100. It values only supplied observations. Events between observations accrue chronologically before the next supplied valuation; no event-day close or reinvestment price is invented. Observed wealth decline uses only those dates and is not an intraday drawdown. Number is used only for bounded presentation ratios after exact arithmetic.

This is a hypothetical gross buy-and-hold comparison, not broker payment-date cash accounting, reinvested total return, a tax calculation, or the synthetic portfolio's return. Taxes, fees, cash in lieu, spin-offs, rights, mergers, return-of-capital cost adjustments and other non-cash distributions are outside this model. Users must confirm there are no unsupported distributions; completeness and source authenticity are not independently verified.

Each dataset has one current owner-scoped event record (maximum 100 events). Edits replace that record with an incremented revision; an atomic revision check rejects stale concurrent saves. Prior event revisions are not retained, so export an analysis before replacing it if needed. The immutable original price dataset and its hash never change. The JSON analysis export includes exact observations, source, current events and revision, modeling assumptions, and all normalized comparison values.

Financial conventions reference [Investor.gov: stock splits](https://www.investor.gov/introduction-investing/investing-basics/glossary/stock-split) and [Investor.gov: ex-dividend dates](https://www.investor.gov/introduction-investing/investing-basics/glossary/ex-dividend-dates-when-are-you-entitled-stock-and). The ex-date receivable treatment is an explicit research convention, separate from payment-date cash settlement.

## Historical portfolios

**My portfolio** starts empty. Import a complete USD ledger from cash funding using this exact header:

```csv
id,date,type,symbol,shares,amount,fee,reference
fund-1,2026-09-14,deposit,,0,1000,0,
```

Types are `deposit`, `withdrawal`, `buy`, `sell`, and `dividend_payment`. `amount` is gross USD consideration, not unit price; the fee is separate. Currency amounts support two decimals and shares six decimals. Cash flows use no symbol/reference; dividend payments use a symbol and the original ex-date in `reference`, zero shares and zero fee. Dates are processed chronologically and same-date ledger rows retain file order. IDs must be unique. The import replaces the complete current ledger; repeated identical saves do not create duplicates.

Map each symbol to one owner-held unadjusted close dataset with a saved complete corporate-action record. Instrument identity (including any ticker reuse), currency and event completeness are explicitly user-declared. Historical and fictional data retain their classification; any synthetic input prominently marks the portfolio as containing fictional prices. The sample portfolio's seed ledger is never imported into this workspace.

The `historical-close-v1` engine applies splits to carried-in holdings, then accrues dividends on ex-date before that day's trades. Fractional split shares use exact reduced BigInt fractions. Aggregate share count times dividend per post-split share is rounded half up once to USD cents for each entitlement. Entitlements remain tied to those original shares, even if the shares are subsequently sold. A matching `dividend_payment` transfers receivable to cash without additional income. Unpaid dividends cannot fund purchases or withdrawals. The full entitlement must be paid at once; partial payments and withholding are not represented.

All ledger events use the daily-close timing convention. Every positive holding needs an exact-date raw close on every valued date (the union of supplied dates, ledger dates, corporate-action dates and the chosen final date). Trades also require their own symbol's exact-date close. No stale/future marks or implicit calendar filling are allowed. Consequently, a cash movement on an unquoted date while stocks are held stops valuation in this first version. Each bound price/event record must cover the chosen final date. Dates before the initial holding may be cash-only.

Cost is weighted average including purchase fees. Sale fees reduce proceeds; remaining basis is allocated proportionally in cents. TWR chains market changes and internal events while excluding external flows. Reconciliation requires `wealth - net contributions = realized gain + unrealized gain + earned dividends`. Prices preserve six decimals and currency/share arithmetic is exact until documented cent rounding and dimensionless display ratios.

One current portfolio per owner supports 1–500 rows, up to 10 symbols and a combined frozen payload of 1 MiB. It starts in cash: opening stock balances and incomplete histories are unsupported. No shorting, leverage, FX, tax-lot accounting, spin-offs, cash in lieu or other unsupported distributions. Preview errors identify missing coverage or invalid cash/holdings before save. This is research accounting, not a brokerage integration.

Saving requires the exact preview fingerprint and an atomic revision check. The saved payload pins complete price observations, corporate-action contents and metadata, transactions, as-of date and calculation version. Later edits in Historical data do not rewrite the saved result. A new import uses the current chosen records and must be previewed again. The JSON export includes the pinned payload, assumptions, daily values, holdings, event journal and dividend entitlements. Previous portfolio revisions are replaced, so export before updating if an archive is required.

## Portfolio benchmark comparison

In **My portfolio → Edit portfolio**, select an optional saved USD benchmark. The model invests the same deposits and sells shares for the same withdrawals at exact closes, preserving same-date order. Splits and non-reinvested dividend receivables are included. It assumes zero benchmark trading costs; your actual ledger retains recorded fees. Insufficient benchmark funds or missing closes stop the comparison. The screen shows matched value paths, dollar gain differences and time-weighted return differences. Full inputs and calculation version are frozen with the saved portfolio; old portfolios remain compatible.

See [portfolio-benchmark.md](docs/portfolio-benchmark.md) for timing, limits, hand-calculated fixtures and export semantics. This is a hypothetical chosen-instrument comparison, not an official total-return index.

## Independent Python verification

Python 3.11+ independently replays exported Research lab experiments using only its standard library. Exact cash/share/trade results and input hashes must agree; floating risk/return metrics use documented tolerances. It does not call TypeScript or verify market-data authenticity.

```sh
pnpm verify:python exported-research.json
pnpm test:python
pnpm test:parity
```

The verifier is supporting tooling; TypeScript remains the application core. See [verification/python/README.md](verification/python/README.md) for supported report formats and checks. Historical portfolio reports use a separate format and are not accepted by this verifier.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/workspace` | Current analytics, quotes, ledger, revision, and run history |
| `POST /api/transactions` | Validate and append an idempotent transaction |
| `POST /api/pipeline` | Validate and ingest/replay the fixture dataset |
| `GET /api/report` | Download the synthetic portfolio CSV report |
| `GET /api/datasets` | List the signed-in user’s imported datasets |
| `GET /api/datasets?id=…` | Read an owned dataset; `download=1` exports it |
| `POST /api/datasets` | Validate and atomically save an immutable CSV snapshot |
| `GET /api/provider` | Read connection readiness and owned provider-run history |
| `POST /api/provider` | Fetch, validate and save supported daily price history |
| `GET /api/actions?id=…` | Read the owned event record; `download=1` exports analysis JSON |
| `POST /api/actions` | Validate and save events with revision conflict protection |
| `GET /api/portfolio` | Read the owned historical portfolio/comparison; `download=1` exports frozen JSON, `download=csv` exports observations |
| `POST /api/portfolio` | Preview or save a complete historical ledger and its bound inputs |
| `GET /api/research` | List owned runs; `id` opens one; `download=json` or `csv` exports |
| `POST /api/research` | Preview or save an immutable experiment, with preview fingerprint verification |

Production requires platform authentication. A development-only identity supports the internal preview. User identity is never accepted from a transaction request body.

## Bowers connection

MarketLab is an independent project. The reporting and data-quality components could later support a specific Bowers reporting or teaching need, if agreed with the team. This repository makes no claim of Bowers sponsorship, deployment, investment activity, or access to institutional financial data.

## Next engineering milestones

The [adopted roadmap](docs/engineering-roadmap.md) replaces the earlier provider-expansion-first order. The client-clock lease bug is fixed with failing-before/passing-after evidence; a SIGKILL recovery test proves one durable result after a retry. The project is published to [GitHub](https://github.com/michaelbawuah/MarketLab) with an automated unit, integration and cross-check gate. See [verification records](docs/verification.md) for observed local and remote results.

The one-click synthetic demo and report confidence certificates are implemented and browser-checked. The next product milestone is one supported brokerage CSV format. Defined-workload performance evidence, explicit floating-point failure evidence, shareable reports, event overlays, staging activation and lightweight collaboration follow in that order. Additional strategies and asset classes remain deferred.

No latency, return, or hiring-outcome claims are made from this demo. See `docs/verification.md` for the checks performed on this release.

## Research lab

**Compare saved experiments** lets you inspect a second saved run without recalculating or changing either snapshot. It follows the full/earlier/later period selected above. Return, observed drawdown, ending wealth, executed trades and fees appear side by side. Differences are comparison minus current and are shown only when methods, frozen price/event inputs, initial cash, evaluation boundaries and exact observation grids match. Window, fee and slippage changes are listed explicitly; multiple changes do not isolate a single cause. A positive drawdown difference means a smaller observed decline. Comparisons are descriptive and do not select an optimal strategy or certify predictive performance.

The `observed-close-sma-v1` engine uses raw USD close snapshots plus complete user-declared event records. Long means current close strictly above its trailing SMA; otherwise cash. Windows count observations. The previous observation signal executes at the next supplied close, after split and dividend entitlement processing. New purchases use millionth shares, split fractions remain exact, fills use price millionths, cash/gross/fees round half up to cents. Purchases conservatively cap sizing at exact pre-rounding affordability and then enforce rounded cash affordability. No shorting, borrowing, interest, final liquidation or dividend reinvestment is modeled; dividends remain nonspendable receivables.

The asset and selected benchmark must have identical full observation grids in the evaluation range. Each uses the same starting cash, fee and adverse slippage rates. Buy-and-hold is a modeled investment in the selected instrument, not an official total-return index. The earlier and later periods independently restart with initial cash; only historical observations warm up signals. Repeated parameter trials can overfit the later period.

Risk statistics use consecutive observed wealth returns: sample standard deviation, Sharpe with zero cash return, covariance beta and Pearson correlation. They are not annualized and do not certify exchange-calendar completeness. Costs at the first evaluation close affect total return/drawdown but are outside the observed risk intervals; later costs enter those intervals. Undefined statistics are null, not zero. All three comparisons use the same dates.

Up to 30 immutable experiments per owner save full price/event inputs, all settings, method version, computed results and trades. Combined input/result JSON is capped at 1,900,000 bytes with room below D1's row limit. Replays of identical snapshots reuse the same SHA-256 ID; changed event payloads/settings create distinct runs. Preview/save compare fingerprints to detect intervening input edits. JSON exports preserve reproducibility; CSV contains exact-cent wealth, cash and receivables for every observation and segment. This module evaluates hypothetical single-asset rules; it does not benchmark a user's cash-flow ledger or claim predictive profitability.

Method references: [Sharpe's original ratio and time-scaling discussion](https://web.stanford.edu/~wfsharpe/art/sr/sr.htm), [NIST sample variance](https://www.itl.nist.gov/div898/handbook/prc/section3/prc32.htm), and [QuantConnect bar availability](https://www.quantconnect.com/docs/v2/writing-algorithms/key-concepts/time-modeling/periods). Execution at the next observed close is this project's explicit conservative convention.
