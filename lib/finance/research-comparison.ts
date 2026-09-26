import { parseDecimal } from './core.ts';
import type { ResearchSnapshot, SavedResearch } from './research.ts';

export type ResearchPeriod = 'full' | 'development' | 'holdout';

// Dataset hashes exclude the separately saved action records. Compare both
// frozen contents; experiment names and save timestamps are not model inputs.
function prices(binding: ResearchSnapshot['asset']) {
  const d = binding.dataset;
  return JSON.stringify([d.id, d.symbol, d.source, d.currency, d.basis,
    d.priceColumn, d.kind, d.origin, d.providerRefreshed, d.providerTimezone,
    d.observations.map(p => [p.date, p.priceMicros])]);
}
function actions(binding: ResearchSnapshot['asset']) {
  const a = binding.actions;
  return JSON.stringify([a.source, a.complete, a.revision,
    a.events.map(e => [e.date, e.type, e.newShares, e.oldShares, e.amount])]);
}

export function compareResearch(left: SavedResearch, right: SavedResearch, period: ResearchPeriod) {
  const a = left.snapshot, b = right.snapshot, differences: string[] = [];
  if (a.method !== b.method) differences.push('Calculation methods differ.');
  for (const role of ['asset', 'benchmark'] as const) {
    const label = role === 'asset' ? 'Asset' : 'Benchmark';
    if (prices(a[role]) !== prices(b[role])) differences.push(`${label} price snapshots or provenance differ.`);
    if (actions(a[role]) !== actions(b[role])) differences.push(`${label} split/dividend records differ.`);
  }
  if (a.config.start !== b.config.start || a.config.end !== b.config.end || a.config.holdoutStart !== b.config.holdoutStart) {
    differences.push('Evaluation dates or the earlier/later split differ.');
  }
  if (parseDecimal(a.config.initialCash) !== parseDecimal(b.config.initialCash)) differences.push('Starting cash differs; sizing and rounding can affect returns.');
  const leftPart = left.analysis[period], rightPart = right.analysis[period];
  const grids = (part: typeof leftPart) => JSON.stringify((['strategy', 'buyHold', 'benchmark'] as const).map(key => part[key].history.map(p => p.date)));
  if (grids(leftPart) !== grids(rightPart)) differences.push('Observed dates differ; missing observations are not filled.');
  const changes: string[] = [];
  if (a.config.window !== b.config.window) changes.push(`SMA window: ${a.config.window} → ${b.config.window} observations`);
  if (a.config.feeBps !== b.config.feeBps) changes.push(`Fee: ${a.config.feeBps} → ${b.config.feeBps} basis points per trade`);
  if (a.config.slippageBps !== b.config.slippageBps) changes.push(`Slippage: ${a.config.slippageBps} → ${b.config.slippageBps} basis points per trade`);
  const aligned = differences.length === 0;
  return {
    aligned, differences, changes, left: leftPart, right: rightPart,
    delta: aligned ? {
      returnPp: rightPart.strategy.returnPct - leftPart.strategy.returnPct,
      drawdownPp: rightPart.strategy.maxDrawdown - leftPart.strategy.maxDrawdown,
      endingValue: (BigInt(rightPart.strategy.history.at(-1)!.value) - BigInt(leftPart.strategy.history.at(-1)!.value)).toString(),
      fees: (BigInt(rightPart.strategy.fees) - BigInt(leftPart.strategy.fees)).toString(),
      trades: rightPart.strategy.trades.length - leftPart.strategy.trades.length,
    } : null,
  };
}
