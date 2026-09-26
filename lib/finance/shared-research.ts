import { researchCertificate, type ConfidenceCertificate, type EvaluationPeriod } from './confidence.ts';
import type { ResearchAnalysis, ResearchSegment, SavedResearch } from './research.ts';
import type { ActionDraft } from './corporate-actions.ts';

export const SHARED_REPORT_FORMAT = 'marketlab-shared-research-v1';
export type SharedResearch = {
  format: typeof SHARED_REPORT_FORMAT;
  method: string;
  symbol: string; benchmark: string;
  settings: { start: string; end: string; holdoutStart: string; window: number; initialCash: string; feeBps: number; slippageBps: number };
  analysis: ResearchAnalysis;
  assetEvents: ActionDraft[];
  certificates: Record<EvaluationPeriod, ConfidenceCertificate>;
};

// Explicit allowlists: future owner metadata added to private records must not
// silently become public through object spreads or a serialized SavedResearch.
function publicSegment(p: ResearchSegment): ResearchSegment {
  const simulation = (s: ResearchSegment['strategy']) => ({
    history:s.history.map(v=>({date:v.date,value:v.value,cash:v.cash,receivables:v.receivables,shares:v.shares})),
    trades:s.trades.map(t=>({date:t.date,signalDate:t.signalDate,side:t.side,shares:t.shares,fillMicros:t.fillMicros,gross:t.gross,fee:t.fee})),
    fees:s.fees,returnPct:s.returnPct,maxDrawdown:s.maxDrawdown,
  });
  const risk = (r: ResearchSegment['strategyRisk']): ResearchSegment['strategyRisk'] => r.volatilityPct===null?{intervals:r.intervals,volatilityPct:null,sharpe:null,beta:null,correlation:null}:{intervals:r.intervals,volatilityPct:r.volatilityPct,sharpe:r.sharpe,beta:r.beta,correlation:r.correlation};
  return {start:p.start,end:p.end,observations:p.observations,longestGapDays:p.longestGapDays,strategy:simulation(p.strategy),buyHold:simulation(p.buyHold),benchmark:simulation(p.benchmark),strategyRisk:risk(p.strategyRisk),buyHoldRisk:risk(p.buyHoldRisk),benchmarkRisk:risk(p.benchmarkRisk),outperformancePct:p.outperformancePct};
}
export function publicResearch(run: SavedResearch): SharedResearch {
  const c=run.snapshot.config;
  const certificates={} as SharedResearch['certificates'];
  for(const period of ['full','development','holdout'] as const) {
    const certificate=researchCertificate(run,period);
    if(certificate.checks.some(check=>check.status==='failed'))throw new Error('This report needs review before sharing. Regenerate the experiment.');
    certificates[period]={...certificate,reference:'Shared summary · private input identifiers withheld',sources:certificate.sources.map(s=>({role:s.role,symbol:s.symbol,source:s.kind==='synthetic'?'Declared fictional inputs':'Declared historical inputs',kind:s.kind,basis:s.basis,origin:'Private source labels withheld',firstDate:s.firstDate,lastDate:s.lastDate,observations:s.observations,events:'Complete event coverage declared by the owner; source labels withheld'})),limitations:[...certificate.limitations,'This summary omits raw price inputs and private source labels. Its consistency checks were calculated against the frozen private inputs; this redacted summary cannot independently replay the full experiment.']};
  }
  return {format:SHARED_REPORT_FORMAT,method:run.snapshot.method,symbol:run.snapshot.asset.dataset.symbol,benchmark:run.snapshot.benchmark.dataset.symbol,
    settings:{start:c.start,end:c.end,holdoutStart:c.holdoutStart,window:c.window,initialCash:c.initialCash,feeBps:c.feeBps,slippageBps:c.slippageBps},
    analysis:{full:publicSegment(run.analysis.full),development:publicSegment(run.analysis.development),holdout:publicSegment(run.analysis.holdout),synthetic:run.analysis.synthetic},
    assetEvents:run.snapshot.asset.actions.events.filter(e=>e.date>c.start&&e.date<=c.end).map(e=>({date:e.date,type:e.type,newShares:e.newShares,oldShares:e.oldShares,amount:e.amount})),certificates};
}
export async function shareDigest(value: string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
