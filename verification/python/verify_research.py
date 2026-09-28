#!/usr/bin/env python3
"""Independently replay exported MarketLab observed-close-sma-v1 research.

Python 3.11+, standard library only. Integer cents and Fraction shares must
match exactly; floating metrics use abs/relative tolerance 1e-10. This checks
internal arithmetic and snapshot identity, not the truth/completeness of
market data, the author's identity, or investment suitability.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import sys
from fractions import Fraction
from typing import Any

METHOD = "observed-close-sma-v1"
MAX_BYTES = 16 * 1024 * 1024
ABS_TOL = REL_TOL = 1e-10
SEGMENTS = ("full", "development", "holdout")
SERIES = ("strategy", "buyHold", "benchmark")


class VerificationError(ValueError):
    """Invalid export, unsupported method, or numerical disagreement."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def exact_keys(value: Any, keys: set[str], label: str) -> dict:
    require(isinstance(value, dict) and set(value) == keys, f"{label}: invalid fields")
    return value


def whole(value: Any, low: int, high: int, label: str) -> int:
    require(type(value) is int and low <= value <= high, f"{label}: invalid integer")
    return value


def decimal_units(value: Any, places: int) -> int:
    require(isinstance(value, str) and re.fullmatch(r"\d{1,9}(?:\.\d{1," + str(places) + r"})?", value, re.ASCII) is not None,
            "Invalid decimal amount")
    parts = value.split(".")
    return int(parts[0]) * 10**places + int((parts[1] if len(parts) == 2 else "").ljust(places, "0"))


def iso_day(value: Any) -> str:
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value, re.ASCII) is not None, "Invalid date")
    try:
        parsed = dt.date.fromisoformat(value)
    except ValueError as error:
        raise VerificationError("Invalid date") from error
    require(parsed.isoformat() == value and value >= "1900-01-01", "Invalid date")
    return value


def text(value: Any, low: int, high: int, label: str) -> str:
    require(isinstance(value, str) and low <= len(value.strip()) <= high
            and not re.search(r"[\x00-\x1f\x7f]", value), f"{label}: invalid text")
    return value


def canonical_hash(value: Any) -> str:
    # Snapshot fields contain only strings, booleans, nulls, and bounded integer
    # numbers. Object insertion order is preserved from the exported JSON.
    try:
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (ValueError, UnicodeError) as error:
        raise VerificationError("Noncanonical JSON snapshot") from error
    return hashlib.sha256(encoded).hexdigest()


def checked_binding(value: Any, label: str) -> dict:
    binding = exact_keys(value, {"dataset", "actions"}, label)
    d = binding["dataset"]
    required = {"id", "symbol", "source", "currency", "basis", "priceColumn", "kind", "observations", "count", "firstDate", "lastDate", "created"}
    optional = {"origin", "providerRefreshed", "providerTimezone"}
    require(isinstance(d, dict) and required <= set(d) <= required | optional, f"{label}: invalid dataset")
    require(d["currency"] == "USD" and d["basis"] == "raw" and d["priceColumn"] == "close", "Only unadjusted USD close research is supported")
    require(d["kind"] in ("historical", "synthetic"), "Invalid dataset kind")
    require(isinstance(d["symbol"], str) and re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,14}", d["symbol"]) is not None, "Invalid symbol")
    text(d["source"], 3, 160, "Dataset source")
    require(d["source"] == d["source"].strip(), "Dataset source is not canonical")
    observations = d["observations"]
    require(isinstance(observations, list) and 2 <= len(observations) <= 2500, "Use 2–2,500 observations")
    previous = ""
    for p in observations:
        exact_keys(p, {"date", "priceMicros"}, "Observation")
        day = iso_day(p["date"])
        require(day > previous, "Observation dates must be unique and increasing")
        previous = day
        require(isinstance(p["priceMicros"], str) and re.fullmatch(r"[1-9]\d{0,12}", p["priceMicros"], re.ASCII) is not None
                and int(p["priceMicros"]) <= 10**12, "Invalid price millionths")
    whole(d["count"], 2, 2500, "Dataset count")
    require(d["count"] == len(observations) and d["firstDate"] == observations[0]["date"] and d["lastDate"] == observations[-1]["date"], "Dataset observation metadata disagrees")
    base_id = canonical_hash(["marketlab-csv-v1", d["symbol"], d["source"], d["currency"], d["basis"], d["priceColumn"], d["kind"], [[p["date"], p["priceMicros"]] for p in observations]])
    origin = d.get("origin", "csv")
    require(origin in ("csv", "alphavantage", "alphavantage-browser"), "Unsupported dataset origin")
    if origin in ("alphavantage", "alphavantage-browser"):
        require("providerRefreshed" in d and "providerTimezone" in d, "Missing provider provenance")
        for field in ("providerRefreshed", "providerTimezone"):
            require(d[field] is None or isinstance(d[field], str) and len(d[field]) <= 160, "Invalid provider provenance")
        base_id = canonical_hash(["marketlab-provider-v1", base_id, {"origin": origin, "refreshed": d["providerRefreshed"], "timezone": d["providerTimezone"]}])
    require(d["id"] == base_id, "Dataset content ID does not match its prices and metadata")
    actions = exact_keys(binding["actions"], {"source", "complete", "events", "revision", "updated"}, "Actions")
    require(actions["complete"] is True, "Event coverage must be confirmed")
    text(actions["source"], 3, 160, "Event source")
    whole(actions["revision"], 1, 9007199254740991, "Event revision")
    require(isinstance(actions["events"], list) and len(actions["events"]) <= 100, "At most 100 events are supported")
    seen = set()
    for event in actions["events"]:
        exact_keys(event, {"date", "type", "newShares", "oldShares", "amount"}, "Event")
        day = iso_day(event["date"])
        require(observations[0]["date"] < day <= observations[-1]["date"], "Event outside dataset range")
        require(event["type"] in ("split", "dividend"), "Invalid corporate action")
        key = (day, event["type"])
        require(key not in seen, "Duplicate event type on one date")
        seen.add(key)
        if event["type"] == "split":
            require(event["amount"] == "" and all(isinstance(event[k], str) and re.fullmatch(r"[1-9]\d{0,5}", event[k], re.ASCII) for k in ("newShares", "oldShares"))
                    and event["newShares"] != event["oldShares"], "Invalid split ratio")
        else:
            amount = decimal_units(event["amount"], 6)
            require(0 < amount <= 10**12 and event["newShares"] == event["oldShares"] == "", "Invalid dividend")
    return binding


def checked_snapshot(value: Any) -> dict:
    snapshot = exact_keys(value, {"method", "config", "asset", "benchmark"}, "Snapshot")
    require(snapshot["method"] == METHOD, "Unsupported research method")
    c = exact_keys(snapshot["config"], {"name", "assetId", "benchmarkId", "start", "end", "holdoutStart", "window", "initialCash", "feeBps", "slippageBps", "confirmed"}, "Research settings")
    text(c["name"], 2, 80, "Research name")
    whole(c["window"], 2, 500, "SMA window")
    whole(c["feeBps"], 0, 1000, "Fee basis points")
    whole(c["slippageBps"], 0, 1000, "Slippage basis points")
    require(10**4 <= decimal_units(c["initialCash"], 2) <= 10**10, "Initial cash outside $100–$100,000,000")
    require(c["confirmed"] is True, "Research conventions must be confirmed")
    require(iso_day(c["start"]) < iso_day(c["holdoutStart"]) < iso_day(c["end"]), "Invalid evaluation boundaries")
    for role in ("asset", "benchmark"):
        checked_binding(snapshot[role], role)
        require(c[role + "Id"] == snapshot[role]["dataset"]["id"], "Configuration dataset ID disagrees")
    return snapshot


def ordered_events(binding: dict) -> list[dict]:
    return sorted(binding["actions"]["events"], key=lambda e: (e["date"], e["type"] != "split"))


def half_up(value: Fraction) -> int:
    require(value >= 0, "Cannot round a negative cash amount")
    return (2 * value.numerator + value.denominator) // (2 * value.denominator)


def share_text(value: Fraction) -> str:
    return str(value.numerator) if value.denominator == 1 else str(value)


def signal_at(binding: dict, position: int, window: int) -> bool:
    # Deliberately recompute each decision window on that decision date's share
    # basis. This does not use the engine's cumulative normalized-price array.
    require(position >= window - 1, "Insufficient previous observations for the SMA signal")
    observations = binding["dataset"]["observations"]
    decision_day = observations[position]["date"]
    splits = [e for e in ordered_events(binding) if e["type"] == "split" and e["date"] <= decision_day]
    adjusted = []
    for quote in observations[position-window+1:position+1]:
        price = Fraction(int(quote["priceMicros"]))
        for event in splits:
            if quote["date"] < event["date"]:
                price *= Fraction(int(event["oldShares"]), int(event["newShares"]))
        adjusted.append(price)
    return adjusted[-1] * window > sum(adjusted, Fraction())


def decision_signals(binding: dict, window: int) -> dict[int, bool]:
    # Cache split bases, then independently sum each complete trailing window.
    # Unlike the canonical engine this never maintains a rolling price sum.
    quotes = binding["dataset"]["observations"]
    splits = [e for e in ordered_events(binding) if e["type"] == "split"]
    basis, cursor, normalized = Fraction(1), 0, []
    for quote in quotes:
        while cursor < len(splits) and splits[cursor]["date"] <= quote["date"]:
            event = splits[cursor]
            basis *= Fraction(int(event["newShares"]), int(event["oldShares"]))
            cursor += 1
        normalized.append(Fraction(int(quote["priceMicros"])) * basis)
    return {i: normalized[i] * window > sum(normalized[i-window+1:i+1], Fraction())
            for i in range(window - 1, len(quotes))}


def affordable_units(cash: int, fill: int, fee_bps: int) -> int:
    # Closed-form inverse of the two half-up roundings, with the method's
    # continuous-cost cap. This is independent of the engine's binary search.
    continuous_cap = cash * 10**14 // (fill * (10000 + fee_bps))
    maximum_gross_cents = (cash * 10000 + 4999) // (10000 + fee_bps)
    rounded_cost_cap = (maximum_gross_cents * 10**10 + 4999999999) // fill
    return min(continuous_cap, rounded_cost_cap)


def simulate(binding: dict, days: list[str], config: dict, strategy: bool, decisions: dict[int, bool] | None = None) -> dict:
    quotes = binding["dataset"]["observations"]
    positions = {q["date"]: i for i, q in enumerate(quotes)}
    events = ordered_events(binding)
    initial = decimal_units(config["initialCash"], 2)
    cash, receivables, fees = initial, 0, 0
    shares = Fraction()
    history, trades = [], []
    prior_day = days[0]
    high = initial
    drawdown = 0.0
    for offset, day in enumerate(days):
        # Initial positions are empty: events on/before a segment start do not
        # create split shares or dividend entitlements.
        for event in events:
            if prior_day < event["date"] <= day:
                if event["type"] == "split":
                    shares *= Fraction(int(event["newShares"]), int(event["oldShares"]))
                else:
                    receivables += half_up(shares * Fraction(decimal_units(event["amount"], 6), 10000))
        index = positions[day]
        raw = int(quotes[index]["priceMicros"])
        if strategy:
            require(decisions is not None and index - 1 in decisions, "Insufficient previous observations for the SMA signal")
        long = decisions[index - 1] if strategy else True
        signal_day = quotes[index - 1]["date"] if strategy else None
        if long and shares == 0 and cash > 0:
            fill = half_up(Fraction(raw * (10000 + config["slippageBps"]), 10000))
            units = affordable_units(cash, fill, config["feeBps"])
            gross = half_up(Fraction(units * fill, 10**10))
            fee = half_up(Fraction(gross * config["feeBps"], 10000))
            if units > 0 and gross > 0:
                shares = Fraction(units, 10**6)
                cash -= gross + fee
                fees += fee
                trades.append({"date": day, "signalDate": signal_day, "side": "buy", "shares": share_text(shares), "fillMicros": str(fill), "gross": str(gross), "fee": str(fee)})
        elif not long and shares > 0:
            fill = half_up(Fraction(raw * (10000 - config["slippageBps"]), 10000))
            gross = half_up(shares * Fraction(fill, 10000))
            fee = half_up(Fraction(gross * config["feeBps"], 10000))
            trades.append({"date": day, "signalDate": signal_day, "side": "sell", "shares": share_text(shares), "fillMicros": str(fill), "gross": str(gross), "fee": str(fee)})
            cash += gross - fee
            fees += fee
            shares = Fraction()
        wealth = cash + receivables + half_up(shares * Fraction(raw, 10000))
        require(cash >= 0 and 0 < wealth <= 10**15, "Wealth or cash outside supported range")
        high = max(high, wealth)
        drawdown = min(drawdown, (wealth / high - 1) * 100)
        history.append({"date": day, "value": str(wealth), "cash": str(cash), "receivables": str(receivables), "shares": share_text(shares)})
        require(strategy or offset > 0 or shares > 0, "Cannot buy a millionth of a share")
        prior_day = day
    return {"history": history, "trades": trades, "fees": str(fees), "returnPct": (int(history[-1]["value"]) / initial - 1) * 100, "maxDrawdown": drawdown}


def observed_metrics(values: list[int], reference: list[int]) -> dict:
    require(len(values) == len(reference) and len(values) >= 2 and all(math.isfinite(v) and v > 0 for v in values + reference), "Invalid risk observations")
    returns = [b / a - 1 for a, b in zip(values, values[1:])]
    ref = [b / a - 1 for a, b in zip(reference, reference[1:])]
    n = len(returns)
    if n < 2:
        return {"intervals": n, "volatilityPct": None, "sharpe": None, "beta": None, "correlation": None}
    mean = math.fsum(returns) / n
    bmean = math.fsum(ref) / n
    centered = [r - mean for r in returns]
    bcentered = [r - bmean for r in ref]
    ss = math.fsum(r*r for r in centered)
    bs = math.fsum(r*r for r in bcentered)
    cov = math.fsum(a*b for a, b in zip(centered, bcentered))
    std = math.sqrt(ss / (n - 1))
    return {"intervals": n, "volatilityPct": std * 100, "sharpe": mean / std if ss > 1e-28 else None,
            "beta": cov / bs if bs > 1e-28 else None,
            "correlation": min(1.0, max(-1.0, cov / math.sqrt(ss*bs))) if ss > 1e-28 and bs > 1e-28 else None}


def replay(snapshot: dict) -> dict:
    s = checked_snapshot(snapshot)
    c = s["config"]
    grid = [[p["date"] for p in s[role]["dataset"]["observations"] if c["start"] <= p["date"] <= c["end"]] for role in ("asset", "benchmark")]
    require(grid[0] and grid[0] == grid[1] and grid[0][0] == c["start"] and grid[0][-1] == c["end"] and c["holdoutStart"] in grid[0], "Evaluation boundaries or matched observation dates disagree")
    earlier = [day for day in grid[0] if day < c["holdoutStart"]]
    later = [day for day in grid[0] if day >= c["holdoutStart"]]
    require(len(earlier) >= 3 and len(later) >= 3, "Each independent period needs three observations")
    result = {}
    decisions = decision_signals(s["asset"], c["window"])
    for key, days in zip(SEGMENTS, (grid[0], earlier, later)):
        sims = {"strategy": simulate(s["asset"], days, c, True, decisions), "buyHold": simulate(s["asset"], days, c, False), "benchmark": simulate(s["benchmark"], days, c, False)}
        reference = [int(p["value"]) for p in sims["benchmark"]["history"]]
        result[key] = {"start": days[0], "end": days[-1], "observations": len(days), "longestGapDays": max((dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days for a, b in zip(days, days[1:])), **sims,
                       **{role + "Risk": observed_metrics([int(p["value"]) for p in sims[role]["history"]], reference) for role in SERIES},
                       "outperformancePct": sims["strategy"]["returnPct"] - sims["benchmark"]["returnPct"]}
    result["synthetic"] = any(s[role]["dataset"]["kind"] == "synthetic" for role in ("asset", "benchmark"))
    return result


def compare(expected: Any, actual: Any, path: str = "analysis") -> int:
    if isinstance(expected, dict):
        require(isinstance(actual, dict) and set(actual) == set(expected), f"{path}: fields disagree")
        return sum(compare(value, actual[key], f"{path}.{key}") for key, value in expected.items())
    if isinstance(expected, list):
        require(isinstance(actual, list) and len(actual) == len(expected), f"{path}: length disagrees")
        return sum(compare(value, actual[i], f"{path}[{i}]") for i, value in enumerate(expected))
    if type(expected) is float:
        require(type(actual) in (int, float) and -1e308 <= actual <= 1e308 and math.isfinite(actual) and math.isfinite(expected)
                and math.isclose(expected, actual, rel_tol=REL_TOL, abs_tol=ABS_TOL), f"{path}: numeric result disagrees (expected {expected!r})")
    else:
        require(type(actual) is type(expected) and actual == expected, f"{path}: exact result disagrees (expected {expected!r})")
    return 1


def verify_report(report: Any) -> dict:
    require(isinstance(report, dict) and report.get("format") in ("marketlab-research-v1", "marketlab-service-job-v1"), "Expected a full MarketLab research JSON or completed service export")
    if report["format"] == "marketlab-service-job-v1":
        require(report.get("status") == "completed", "Only completed service exports can be verified")
    require("snapshot" in report and "analysis" in report, "Report needs frozen snapshot and analysis")
    checked_snapshot(report["snapshot"])
    require(report.get("id") == canonical_hash(report["snapshot"]), "Report ID does not match its ordered snapshot")
    expected = replay(report["snapshot"])
    compared = compare(expected, report["analysis"])
    return {"format": "marketlab-python-verification-v1", "verified": True, "id": report["id"], "method": METHOD,
            "segments": 3, "simulations": 9, "comparedFields": compared, "exactAccounting": True,
            "floatAbsoluteTolerance": ABS_TOL, "floatRelativeTolerance": REL_TOL,
            "scope": "Independent replay and internal consistency; supplied data and event completeness are not externally verified."}


def reject_constant(value: str) -> None:
    raise VerificationError(f"Non-finite JSON number: {value}")


def unique_object(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate JSON object key")
        result[key] = value
    return result


def read_report(path: Path) -> Any:
    with path.open("rb") as stream:
        raw = stream.read(MAX_BYTES + 1)
    require(len(raw) <= MAX_BYTES, "Report exceeds 16 MiB")
    return parse_report(raw)


def parse_report(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object, parse_constant=reject_constant)
    except (UnicodeError, ValueError, RecursionError) as error:
        raise VerificationError("Invalid UTF-8 JSON report") from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path, nargs="?", help="Full report JSON exported from Research lab or the completed service job CLI")
    parser.add_argument("--stdin", action="store_true", help="Bounded service protocol; read one full report from stdin")
    args = parser.parse_args()
    if bool(args.report) == args.stdin:
        parser.error("Choose either a report file or --stdin")
    try:
        if args.stdin:
            # Service runs on Linux. Bound memory/CPU even if the parent dies.
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_CPU, (6, 6))
            resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
            raw = sys.stdin.buffer.read(1_950_001)
            require(len(raw) <= 1_950_000, "Report exceeds service replay limit")
            summary = verify_report(parse_report(raw))
            summary["inputDigest"] = hashlib.sha256(raw).hexdigest()
        else:
            summary = verify_report(read_report(args.report))
    except (VerificationError, OSError, RecursionError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(summary, indent=2, allow_nan=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
