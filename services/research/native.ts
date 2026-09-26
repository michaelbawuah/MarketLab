import { createRequire } from 'node:module';
import type { ResearchAnalysis } from '../../lib/finance/research.ts';
import { observedMetrics } from '../../lib/finance/research.ts';
const require=createRequire(import.meta.url);
export type Metrics=ReturnType<typeof observedMetrics>;
type Addon={observedMetrics:(values:Float64Array,benchmark:Float64Array)=>Metrics};
export function loadNative():Addon {return require('../../native/build/marketlab_risk.node') as Addon;}
export function verifyNative(analysis:ResearchAnalysis,addon:Addon) {
  let maxAbsoluteError=0,comparisons=0;
  for(const period of ['full','development','holdout'] as const){const part=analysis[period],benchmark=Float64Array.from(part.benchmark.history,p=>Number(p.value));
    for(const series of ['strategy','buyHold','benchmark'] as const){const actual=addon.observedMetrics(Float64Array.from(part[series].history,p=>Number(p.value)),benchmark),expected=part[`${series}Risk`];
      for(const key of ['intervals','volatilityPct','sharpe','beta','correlation'] as const){const a=actual[key],b=expected[key];if(a===null||b===null){if(a!==b)throw new Error('Native metric parity failed.');}else {const error=Math.abs(a-b);if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(error)||(key==='intervals'&&a!==b)||error>1e-12*(1+Math.abs(b)))throw new Error('Native metric parity failed.');maxAbsoluteError=Math.max(maxAbsoluteError,error);}}
      comparisons++;
    }
  }
  return {engine:'cpp-node-api-v1',comparisons,maxAbsoluteError};
}
