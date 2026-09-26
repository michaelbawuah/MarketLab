# Exact money, visible failure

Milestone 8 makes the existing accounting model inspectable. It does not replace
a floating-point ledger: MarketLab already uses BigInt for monetary decisions.
The application demo lives in **Methodology → Why we count in cents**. Its two
fictional examples run the same module as the command-line demonstration.

## Reproduce the difference

```sh
pnpm demo:money             # exits 0 only if naive fails and exact passes
pnpm demo:money --naive     # deliberately exits 1: both monetary contracts fail
pnpm demo:money --exact     # exits 0: both contracts hold
pnpm test:unit              # includes these failures as expected regression cases
```

| Contract | Naive JavaScript Number calculation | Exact calculation |
| --- | --- | --- |
| Fund 30¢, pay 10¢, then pay 20¢; accept both and end at zero | After the first payment, `0.30 - 0.10` is `0.19999999999999998`. A comparison with `0.20` rejects the second payment. | `parseDecimal` converts text into integer cents. The production `account` function accepts both withdrawals: `30n - 10n - 20n = 0n`. |
| One share at $1.005 costs 101¢ under half-up cent rounding | `Math.round(1.005 * 100)` returns 100. The intermediate binary floating-point value is slightly below 100.5. | Parse both operands to six decimal places, multiply integers, then apply the production `rounded` helper: exactly 100.5¢ rounds to 101¢. This is the research engine's trade-cost scale and rounding expression. |

Formatting the first remainder with `toFixed(2)` produces `"0.20"`; it does not
change the value used by the comparison. Adding a universal epsilon is also not
our accounting policy. Parse decimal text before arithmetic, preserve its scale,
and round only at an explicitly defined boundary. A price of $1.005 is valid in
the research price model; a **cash input** of $1.005 is rejected rather than
silently rounded.

The naive paths in `lib/finance/money-examples.ts` are educational and never save
a transaction. The app retains its normal validation and affordability checks.

## Representations and boundaries

| Quantity | Internal representation | Boundary |
| --- | --- | --- |
| Cash, gross ledger amounts, fees and cost basis | BigInt integer USD cents | Input text has at most two decimal places. Withdrawals are separate event kinds; negative cash inputs are rejected. Signed balances/gains remain signed integers. |
| Entered share quantities | BigInt integer millionths | At most six decimal places; excess precision is rejected. |
| Holdings after corporate actions | Reduced BigInt numerator/denominator | Splits preserve fractions such as 1/3 without rounding to millionths. Research buys use millionths; its split-adjusted holdings retain fractions. The hypothetical matched-flow benchmark permits exact fractional purchases. |
| Historical/research prices and per-share dividends | BigInt millionths of a dollar | At most six decimal places. The older synthetic demo's quote schema instead stores integer cents. Do not interchange these schemas. |
| Serialized exact values | Decimal strings, or explicit rational strings | JSON does not serialize BigInt directly. Keep strings through JSON/database round trips; use BigInt again before bookkeeping arithmetic. |
| Returns, volatility, correlations, chart coordinates and legacy demo presentation fields | JavaScript Number | Approximate dimensionless calculations and display, after exact accounting. These are not used to approve ledger spending. Exact money does not imply exact statistical metrics or authentic input data. |

Input and report size/range limits still apply. BigInt avoids arithmetic overflow
within those supported models; it is not a promise to accept arbitrarily large
inputs. The large-integer JSON regression demonstrates serialization only, not
a supported portfolio size.

## Rounding policy

For a **nonnegative** numerator `n` and **positive** denominator `d`, `rounded`
computes `(n + d / 2n) / d` with integer division: nearest integer, ties up.
Callers validate the domain; the low-level helper does not. It is not a general
negative-number rounding function. Apply it to positive consideration/basis
before adding or subtracting those amounts from signed cash or gains.

- Research slippage first rounds the execution price to millionths of a dollar.
  Trade consideration then rounds to cents. A newly purchased millionth-share
  quantity times a micro-dollar price is divided by `10^10` for cents. Fees
  round separately from gross consideration using basis points divided by 10,000.
  Sizing rechecks exact rounded gross plus fee against cash.
- Historical portfolio ledger imports use recorded gross amounts and separate
  fees; they do not reconstruct cash from a rounded display price. The brokerage
  adapter reconciles the source net cash to that recorded gross and fee.
- A valued holding or research/historical dividend entitlement multiplies its
  exact share fraction by the micro-dollar price/amount, then rounds the aggregate
  once to cents. Historical dividends accrue as receivables; later payment moves
  that same cent amount into spendable cash.
- Average cost allocates a partial sale's basis proportionally in cents. A final
  sale consumes the remaining basis, avoiding a stranded cent. The regression
  divides a 10,000¢ basis over three one-share sales: 3,333¢, 3,334¢, 3,333¢.
- The separate single-instrument corporate-action comparison retains rational
  wealth/income for its normalized indexes; it is not broker cash settlement.

These are explicit research conventions. The model does not implement every
broker's rounding policy, tax lots, shorting, multi-currency settlement or cash
in lieu. A six-decimal price is stored at that precision, not made more accurate
than the supplied observation.

## Acceptance evidence

The demonstration, focused tests, full release gate and browser checks are
recorded in [release verification](verification.md). The focused suite covers
both observed float failures, prices immediately below/at/above a half cent,
millionth-share trades, a genuine overdraft, complete basis conservation and
exact JSON round trips. The CI suite asserts that the intentionally naive
examples fail their contracts; it does not install a permanently failing CI job.

Sources of behavior: [core accounting](../lib/finance/core.ts),
[research engine](../lib/finance/research.ts),
[historical portfolios](../lib/finance/historical-portfolio.ts),
[examples](../lib/finance/money-examples.ts), and
[regressions](../tests/unit/money-examples.test.ts).
