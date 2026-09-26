import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNative,verifyNative } from '../../services/research/native.ts';
import { observedMetrics,analyzeResearch } from '../../lib/finance/research.ts';
import { researchFixture } from '../fixtures/research.ts';
const addon=loadNative();
function parity(a:number[],b:number[]){const actual=addon.observedMetrics(Float64Array.from(a),Float64Array.from(b)),expected=observedMetrics(a,b);for(const key of Object.keys(expected) as (keyof typeof expected)[]){const x=actual[key],y=expected[key];if(y===null)assert.equal(x,null);else{assert.notEqual(x,null);assert.ok(Math.abs(x!-y)<=1e-12*(1+Math.abs(y)),`${key}: ${x} != ${y}`);}}}
test('C++ agrees with independent, flat, inverse, short and scaled risk fixtures',()=>{
  parity([100,110,99,108.9],[100,105,99.75,104.7375]);parity([100,110,99,108.9],[100,95,99.75,94.7625]);
  parity([100,100,100],[100,110,99]);parity([100,110,99],[100,100,100]);parity([100,110],[100,105]);
  for(const scale of [1e-6,1,1e12])parity([100,110,99,108.9].map(v=>v*scale),[100,105,99.75,104.7375].map(v=>v*scale));
  for(const delta of [1e-15,1e-14,1e-13])parity([100,100*(1+delta),100],[100,100*(1-delta),100]);
});
test('C++ agrees across 100 deterministic return paths and offset typed-array views',()=>{
  for(let sample=0;sample<100;sample++){const a=[100],b=[120];for(let i=1;i<70;i++){a.push(a.at(-1)!*(1+Math.sin(i*3.1+sample)*.02));b.push(b.at(-1)!*(1+Math.cos(i*.7+sample)*.03));}parity(a,b);}
  const backing=new Float64Array([0,100,110,99,0]);assert.deepEqual(addon.observedMetrics(backing.subarray(1,4),backing.subarray(1,4)),observedMetrics([100,110,99],[100,110,99]));
});
test('native boundary rejects malformed, shared and nonfinite inputs',()=>{
  const valid=new Float64Array([100,110]);for(const values of [new Float64Array([100]),new Float64Array([0,100]),new Float64Array([NaN,100]),new Float64Array([Infinity,100]),new Float64Array([-1,100]),new Float64Array([1e16,100]),new Float64Array(2501),new Float64Array(new SharedArrayBuffer(16))])assert.throws(()=>addon.observedMetrics(values,valid));
  assert.throws(()=>addon.observedMetrics([100,110] as unknown as Float64Array,valid));
});
test('verification rejects nonfinite or missing canonical metrics',async()=>{
  const analysis=analyzeResearch(await researchFixture());for(const bad of [NaN,Infinity,undefined]){const broken=structuredClone(analysis);broken.full.strategyRisk.beta=bad as number;assert.throws(()=>verifyNative(broken,addon),/parity failed/);}
});
