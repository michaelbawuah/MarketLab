import { costDemoCertificate } from './confidence.ts';
import { validateImport } from './market-data.ts';
import { analyzeResearch, RESEARCH_ASSUMPTIONS, RESEARCH_METHOD, type ResearchSnapshot, type SavedResearch } from './research.ts';
import { DEMO_DATASET_ID, DEMO_RUN_IDS } from './quick-demo-fingerprints.ts';

export const DEMO_VERSION = 'trading-costs-demo-v1';
export const DEMO_CREATED = '2026-02-23T00:00:00.000Z';
export const DEMO_COSTS = [
  { id: 'illustrative', label: '0.10% fee + 0.05% slippage', feeBps: 10, slippageBps: 5 },
  { id: 'higher', label: '0.25% fee + 0.15% slippage', feeBps: 25, slippageBps: 15 },
  { id: 'zero', label: 'No fees or slippage', feeBps: 0, slippageBps: 0 },
] as const;
export type DemoCost = typeof DEMO_COSTS[number]['id'];

/** A deliberately choppy teaching fixture, not sampled or calibrated market data. */
export async function demoSnapshot(cost: DemoCost = 'illustrative'): Promise<ResearchSnapshot> {
  const preset = DEMO_COSTS.find(item => item.id === cost);
  if (!preset) throw new Error('Choose one of the demo cost settings.');
  const prices = [100,100.1,100.2,100,100.3,100.1,100.4,100.2,100.5,100.3,100.6,100.4,100.7,100.5,100.8,100.6,100.9,100.7,101,100.8,101.1,100.9,101.2,101,101.3,101.1,101.4,101.2,101.5,101.3,101.6,101.4,101.7,101.5,101.8,101.6];
  const dates: string[] = [];
  for (let day = new Date('2026-01-05T00:00:00Z'); dates.length < prices.length; day.setUTCDate(day.getUTCDate() + 1)) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.push(day.toISOString().slice(0,10));
  }
  const input = validateImport({ symbol: 'XDEMO', source: `MarketLab fictional teaching prices · ${DEMO_VERSION}`, kind: 'synthetic', basis: 'raw', priceColumn: 'close', csv: 'date,close\n' + dates.map((date,i) => `${date},${prices[i]}`).join('\n') });
  const dataset = { ...input, id: DEMO_DATASET_ID, count: dates.length, firstDate: dates[0], lastDate: dates.at(-1)!, created: DEMO_CREATED };
  // Events are known by construction for this fictional instrument.
  const binding = { dataset, actions: { source: 'MarketLab fictional instrument · no splits or dividends', complete: true as const, events: [], revision: 1, updated: DEMO_CREATED } };
  return { method: RESEARCH_METHOD, config: { name: 'Quick demo · trading costs', assetId: dataset.id, benchmarkId: dataset.id, start: dates[3], end: dates.at(-1)!, holdoutStart: dates[20], window: 3, initialCash: '10000', feeBps: preset.feeBps, slippageBps: preset.slippageBps, confirmed: true }, asset: binding, benchmark: binding };
}

export async function calculateDemo(cost: DemoCost = 'illustrative'): Promise<SavedResearch> {
  const snapshot = await demoSnapshot(cost);
  return { id: DEMO_RUN_IDS[cost], name: snapshot.config.name, created: DEMO_CREATED, symbol: 'XDEMO', benchmark: 'XDEMO', start: snapshot.config.start, end: snapshot.config.end, snapshot, analysis: analyzeResearch(snapshot) };
}

export function demoReport(run: SavedResearch) {
  return { format: 'marketlab-research-v1', ...run, assumptions: RESEARCH_ASSUMPTIONS, confidence: costDemoCertificate(run), demo: { version: DEMO_VERSION, fictional: true, savedToWorkspace: false, purpose: 'Illustrate how trading costs change a fixed-rule result on deliberately choppy fictional prices. Not a forecast or market evidence.' } };
}

export function demoDifference(withoutCosts: SavedResearch, withCosts: SavedResearch) {
  return (BigInt(withoutCosts.analysis.full.strategy.history.at(-1)!.value) - BigInt(withCosts.analysis.full.strategy.history.at(-1)!.value)).toString();
}
