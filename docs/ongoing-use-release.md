# MarketLab ongoing-use release — September 28, 2026

The user authorized goal-based planning, multi-account aggregation, lifetime fee
illustrations, drift alerts, what-if analysis, optional peer comparisons and a
verified strategy library. This extends the consumer and personal-workspace work;
it does not remove the earlier production-preflight or real-participant gates.

## Delivered behavior

- **My plan:** up to 25 manually updated USD accounts plus the existing imported
  portfolio, and up to 10 saved goals. Brokerage, retirement/401(k), cash, crypto,
  property, other assets and debt have separate roles. Balances carry dates;
  stale values are surfaced. Fictional imported portfolios are excluded.
- **Goals:** selected accounts, target amount/date and monthly contributions;
  editable return, fee and inflation assumptions. A cent-based monthly model
  shows whether those assumptions reach the target, sensitivity at ±3 return
  percentage points, purchasing power and the required contribution. Shared
  goal funding is explicitly counted independently, not silently allocated.
- **Fees:** recorded fees distinguish unknown from zero. The projection splits
  future fee payments from the additional change in growth. Historical fees are
  not charged twice. All assumed returns, costs, horizon and contributions are
  visible. Recorded fees are not claimed to cover a person's entire lifetime.
- **Drift:** user-set broad asset weights and a default 5 percentage-point
  threshold. In-app alerts recalculate from saved balances on opening/return.
  No bank monitoring, external notifications or automatic trades are implied.
- **What if:** extra monthly saving toward a goal; user-adjustable simultaneous
  shocks across asset groups; past extra contributions following the existing
  portfolio engine's flow-adjusted history; and a goal sensitivity using a saved
  backtest's worst historical decline. Backtest returns are never promoted to
  an expected annual return. The severe shock preset is explicitly illustrative,
  not a 2008 historical reconstruction.
- **Strategy library:** tested 20/50/200-price trend templates reuse the existing
  causal engine. User publications require an exact report-bound independent
  replay receipt, non-fictional input classification, an allowlisted public
  report, a matching preview digest and explicit consent. Public cards expose
  compact summaries; full reports are fetched individually. Applying a template
  copies only rule/cost settings into a new run on the recipient's own data.
  No receipt, data access or result is inherited. Authors can unpublish.
- **Peer comparisons:** opt-in contributions for a fixed completed calendar
  quarter and nine fixed goal/risk cohorts, calculated from the imported
  portfolio's full-quarter return history. No partial-period annualization.
  At least 20 accounts are required. Only a whole-percentage-point median and
  a broad count band are released. The aggregate is frozen once, and withdrawal
  removes the contributed return and disables the affected snapshot rather than
  recalculating it. A minimal withdrawal tombstone prevents rejoining that
  quarter. There is no privacy claim of guaranteed anonymity, distinct human
  identities or representative performance. No real peer data was fabricated.
- **Trust and support:** educational/non-advisory framing, actual data-processing
  and deletion limits, in-app support requests with an owner inbox/replies,
  and a current website/D1 status check. The readiness score is a transparent
  four-item checklist, not a financial-health or investment-quality rating.

## Persistence and privacy

Five additive D1 tables, generated migration
`0009_tranquil_roland_deschain.sql`. No legacy tables were rewritten. Planning
uses an owner-keyed revision fence; ownership always comes from the existing
verified account path. Client-supplied owner fields are rejected. Support inbox
access requires the original dispatcher-verified owner identity, not an email
string from a separate sign-in method. Peer releases use an atomic SQLite
aggregate statement so the threshold and median observe the same data.

No new paid service, bank aggregator, messaging provider or runtime connection
was added. Railway's calculation protocol/runtime is unchanged. New planning
modules live outside the standalone service's deployment inputs.

## Acceptance evidence

- Typecheck and lint passed.
- 149 unit tests passed, including 14 planning/peer regressions. Integer money,
  symmetric cent rounding, debt accounting, fee reconciliation, contribution
  timing, target feasibility, stale values and input boundaries are covered.
- Independent Python `Decimal` replay agreed exactly: $10,000 initial, $200
  monthly, 5% nominal return and 0.25% fee for 12 months => **$12,938.32**, with
  **$28.44** projected fees. A separate 20-year example also matched.
- 435 built-Worker HTTP/header/content assertions passed with real isolated D1
  and fictional identities. This includes new-account isolation, simultaneous
  stale-write fencing, exports, receipt-gated publication, redaction, consent,
  public removal, cohort suppression at 19 / release at 20, frozen snapshots,
  withdrawal and support authorization. A prior assertion-counter expression
  overwrote increments inside awaited helpers; it now preserves the actual
  checks. Additional assertions were not substituted for missing executions.
- Browser preview: created a fictional $10,000 account, saved a $20,000 goal,
  reloaded it, observed $12,938.32 and a $775.78 required monthly contribution;
  saved 55/35/10 targets and observed the two 5-point drift alerts; verified
  a library template populates a fresh backtest form with the recipient's data.
- 390px phone view: main client/scroll width both 375px (15px scrollbar).
  Fixed an observed wrapping-tab overlap and supplied actual ARIA tab panels.
  Dialog labels, hidden form-checkbox behavior, focus styles and chart text
  alternatives were inspected. This is not a complete WCAG conformance audit.
- Evidence images: `evidence/planning-desktop.jpg` and
  `evidence/planning-phone.jpg`, using local fictional QA records only.

## Explicit remaining work

- Real production sign-in/save/return and phone-download preflight, a consenting
  real brokerage export, and the three actual pilot sessions. No participant
  sessions or production user actions are claimed by local test evidence.
- Plaid or another bank connection after traction and an approved budget/vendor
  choice; balances and drift alerts currently depend on user updates.
- A qualified legal review, full independent WCAG 2.1 AA audit, production
  identity/security review, backup/restore evidence and continuous monitoring.
  The app states these limits instead of asserting bank-grade security,
  audited compliance, regulatory registration or an uptime guarantee.
- Complete-workspace deletion is a support request, not a finished self-service
  deletion or guaranteed erasure from third-party logs/backups. Read the current
  trust page before making broader privacy or security claims.

## Primary references used for product language

- [SEC Investor.gov — Understanding Fees](https://www.investor.gov/introduction-investing/getting-started/understanding-fees)
- [SEC — Financial goals and risk considerations](https://www.sec.gov/investor/pubs/tenthingstoconsider.htm)
- [W3C WCAG 2.1](https://www.w3.org/TR/WCAG21/)
- [W3C minimum contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)
- [Cloudflare D1 data security](https://developers.cloudflare.com/d1/reference/data-security/)
