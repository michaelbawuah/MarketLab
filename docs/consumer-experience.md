# Consumer experience standard

The September 28, 2026 user direction makes consumer usability the current
product priority. The calculation engines, ownership rules, saved input identity,
and independent verification remain the foundation.

| Required standard | Implemented behavior |
| --- | --- |
| Hide machinery, preserve trust | A compact check badge, coverage date, and plain result summary. Source fingerprints, methodology, individual checks, receipts and job details stay under closed disclosures. Only a bound independent receipt earns “Independently verified.” |
| One clear path | Start here → try costs → use your own data. Clear import, backtest, save and share actions; sample administration under More examples. Chart trade annotations start off. |
| Plain language | Inline explanations on result cards; keyboard-accessible help for return, drawdown, Sharpe ratio, volatility, beta, correlation, slippage, cost basis and other metrics. |
| Value without setup | Anonymous visitors and workspace owners can run the existing fictional $10,000 cost example immediately, with no upload, provider request or saved record. |
| Consistent design | One teal, ink and white product system, legible type, consistent cards and controls, responsive forms and compact navigation. |
| Human errors | Known failures offer recovery steps. Unexpected technical messages fall back to safe plain language; root page failures have a retry screen. |
| Sensible defaults | Backtests choose eligible saved prices, the same-stock comparison, $10,000 and 0.10% fees / 0.05% slippage. Dates retain the trend warmup and at least three observations per segment. The window starts at 20 or shortens when only a shorter usable history is available. Advanced choices are collapsed. |

## Preserved boundaries

- Anonymous access contains only the existing fictional teaching data. Saved
  workspaces and APIs are now private to each authenticated account under the
  later September 28 authorization; see [personal workspaces](personal-workspaces.md).
- Independent verification, internal consistency, and source authenticity remain
  distinct. Coverage dates never imply a live quote or complete exchange calendar.
- Upload price adjustments remain Unknown until the user can confirm them;
  unknown or adjusted prices are not silently treated as raw backtest inputs.
- Import completeness and company-event declarations remain explicit. A default
  cannot safely invent missing prices, distributions or user confirmation.
- Financial engines, snapshot hashes, exact arithmetic and service protocols
  are unchanged. No new paid service, provider retry or production-data mutation.

## Observed acceptance of the earlier consumer redesign

Browser checks used the supervised local preview and fictional records. They
confirmed the zero-cost demo produces identical $10,487.21 endings, resetting
restores the $506.44 cost difference, metric help responds to keyboard focus,
and technical disclosures start closed. A fictional backtest was previewed and
saved with preset inputs. Changing to XDEMO automatically selected September
17–24 and the matching same-stock comparison. An invalid price CSV displayed
recovery guidance; correcting it produced a preview and saved the fictional file.

Desktop welcome and shared-report visuals used temporary component fixtures
without reading private data. Those routes were removed before the release
build. The 390-pixel iframe check measured equal document client/scroll widths
of 375 pixels (excluding the scrollbar), and a 356-pixel dialog with no horizontal
overflow. Navigation closes after selecting a page. This is narrow browser
layout evidence, not a physical-device or complete accessibility audit.

[Welcome](evidence/consumer-welcome.jpg) ·
[Narrow backtest form](evidence/consumer-narrow.jpg) ·
[Shared report](evidence/consumer-report.jpg)

Type checking and lint passed. The focused release checks passed 134 unit tests,
4 C++ checks and 11 Python tests; independent replay matched 67,044 fields in
10 fresh reports. The production-built Worker passed 274 HTTP, content and
header assertions, including anonymous demo entry, owner-only API denial,
sharing consent, redaction, revocation and bound replay receipts. UI changes
were checked again by the publication workflow.

A full local MongoDB integration rerun was attempted but its existing downloaded
binary crashed at startup (including on --version). This does not constitute a
passing full integration gate; the unchanged service was not redeployed. Local
preview migrations 0007 and 0008 were applied only to its old disposable data.
These checks do not establish a new live owner lifecycle, remote CI run or
pilot adoption result. Production deployment is recorded by Sites separately.
