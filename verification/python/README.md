# Independent Research lab verification

Python 3.11 or newer; standard library only. This is an offline verifier for the **Research lab** export, separate from the portfolio benchmark. The live application and canonical finance engine remain TypeScript.

```sh
# Download Full report JSON from Research lab, then replay it independently:
pnpm verify:python exported-research.json
# Or call Python directly:
python3 verification/python/verify_research.py exported-research.json

# Independent arithmetic/rejection tests and current TypeScript parity:
pnpm test:python
pnpm test:parity
```

The verifier accepts `marketlab-research-v1` and completed `marketlab-service-job-v1` exports for `observed-close-sma-v1`. It replays all three evaluation segments and three investment paths per segment. Cash, receivables, exact rational shares, signal/execution dates, fill prices, gross trade amounts and fees must match exactly. Returns, drawdown, volatility, Sharpe, beta, correlation and outperformance use absolute and relative tolerance of 1e-10; undefined values must remain null.

Python uses integers and `fractions.Fraction`, a closed-form inverse for rounded trade affordability instead of TypeScript's binary search, independently summed SMA windows, and `math.fsum` for risk statistics. It preserves the current engine's continuous-cost cap before cent rounding. It neither imports nor invokes TypeScript during verification and uses no network calls.

Dataset IDs, provider provenance IDs and ordered snapshot fingerprints are recomputed. Hash agreement proves internal consistency, not the source's authenticity: someone editing a report can also recompute its hashes. Supplied prices, instrument identity and corporate-action completeness are not externally verified. The report's JSON object order is retained because the current snapshot fingerprint is order-sensitive. Archived reports do not depend on today's date.

The CLI prints a JSON verification receipt to stdout and exits with status 1 for rejected input or a mismatch. It reads at most 16 MiB, rejects duplicate JSON keys and nonfinite numeric literals, and leaves the input unchanged. Dates, schema, observation/action counts, cash and cost parameters are bounded to the supported method. A future method requires an explicit new implementation; changing an accepted version label does not establish compatibility.

## Checked evidence

- 11 tests cover independent split/dividend and cost arithmetic, next-close timing, fresh holdout cash, reverse splits, known and degenerate risk values, exhaustive small affordability examples, edited results, altered snapshot/provider IDs, strict JSON and CLI success/failure.
- Five small fictional TypeScript exports are frozen under `fixtures/`. Their expected headline values are independently asserted in Python tests.
- `scripts/test-python-parity.ts` regenerates those five reports from the current TypeScript engine and verifies each with Python. It also verifies a fresh 2,500-observation input with the maximum 500-observation SMA and all three Quick experiment cost presets. This batch matched 66,678 scalar fields across nine reports. The actual default report downloaded from the browser also passed all 1,575 comparisons.

This verifier does not accept `marketlab-portfolio-v1/v2` or validate the new portfolio cash-flow comparator. That comparator has separate hand-calculated TypeScript regression fixtures. Neither suite establishes trading profitability, provider accuracy or production service availability.
