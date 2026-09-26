# Portfolio cash-flow comparison

In **My portfolio → Edit portfolio**, select an optional **Cash-flow benchmark** from your saved unadjusted USD datasets. It needs a saved complete event record and exact closes covering every portfolio valuation date. Preview, reconcile and save to freeze the benchmark with the ledger. Existing saved portfolios continue working without a benchmark.

The `cash-flow-close-v1` model invests each deposit in the chosen instrument and sells shares for each withdrawal, at that date's supplied close and in the ledger's same-date order. Internal trades, fees and dividend-payment entries in the real ledger do not become benchmark contributions. Fractional benchmark shares are exact rational quantities; no fees, slippage, taxes, borrowing or shorting are modeled. Your portfolio retains its recorded costs. The comparison is an ideal zero-cost alternative, not an official total-return index or a claim of alpha.

Splits apply before dividend entitlements and before close-timed flows. Benchmark cash dividends accrue as non-reinvested, nonspendable receivables on ex-date. They remain receivables throughout this model; the user's recorded dividend payments belong only to the user's portfolio. A withdrawal that cannot be funded from benchmark holdings stops the preview. No partial withdrawal or implicit borrowing is substituted. Choose another benchmark or remove the comparison to save that ledger on its own.

Wealth and each aggregate dividend entitlement round half up to cents. Withdrawing the full marked holdings value liquidates all shares, preventing a fractional short balance from cent rounding. A positive holding that would round to zero total wealth stops the comparison rather than reporting a permanent total loss. Values are bounded to the same supported scale as the portfolio; growing rational-share journals stop at a 1 MiB audit budget before an oversized response can accumulate.

Both paths are shown on the existing portfolio valuation grid. Benchmark events between observations apply before the next value; extra benchmark quotes do not add portfolio observations. Every required benchmark close must exist, and no stale or future quote is substituted. The time-weighted return links market changes before each close-timed flow, excluding the external funding itself. Drawdown is measured on that observed return path, not intraday.

The screen shows ending wealth, gain after external flows, time-weighted return, observed drawdown, receivables, dollar wealth difference and return difference in percentage points. Any fictional input marks the comparison and shared chart as synthetic. Dataset choice, identity and event completeness remain user-declared.

## Frozen reports and compatibility

The existing `historical-close-v1` portfolio engine is unchanged. A benchmark adds an optional, separately versioned binding to the frozen portfolio payload. Its complete dataset and event record enter the preview/save fingerprint. Existing records retain their original snapshots and fingerprints. The existing owner/revision conflict check also protects benchmark edits. Updating a record in Historical data cannot rewrite a saved portfolio comparison.

**Full report JSON** includes the ledger, all frozen inputs, portfolio analysis, benchmark flow journal, dividend entitlements, exact share fractions, dated values and comparison assumptions. Benchmark reports use `marketlab-portfolio-v2`; exports without a benchmark retain `marketlab-portfolio-v1`. **Observations CSV** contains exact integer cents and time-weighted returns for the matched dates; missing benchmark columns are blank when comparison is off. No migration or production data backfill is required.

## Independent arithmetic fixture

| Date | Benchmark close | Event / external flow | Closing shares | Receivable | Closing value |
| --- | ---: | --- | ---: | ---: | ---: |
| Sep 14 | $100 | Deposit $1,000 | 10 | $0 | $1,000 |
| Sep 15 | $50 | 2-for-1 split; deposit $200 | 24 | $0 | $1,200 |
| Sep 16 | $49 | $1/share dividend; withdraw $196 | 20 | $24 | $1,004 |
| Sep 17 | $55 | None | 20 | $24 | $1,124 |

Net funding is $1,004, gain is $120, and observed time-weighted return is approximately 11.9521912351%. These are fictional test inputs. Ten regression tests also exercise internal-event exclusion, between-date actions, order-dependent funding, cent liquidation, insufficient funds, sub-cent precision, missing coverage, old snapshot compatibility, bounded audit output and exact CSV output.

The model follows the distinction between external contributions and earned investment income and geometrically linked returns described in [CFA Institute's historical calculation guidance](https://www.gipsstandards.org/wp-content/uploads/2021/03/calculation_methodology_gs_2006.pdf). That source informs the documented research convention; MarketLab does not claim GIPS compliance. [S&P's dividend-index explanation](https://www.spglobal.com/spdji/en/education/article/faq-sp-500-dividend-points-index/) distinguishes reinvested total-return indices from this non-reinvested holding model.
