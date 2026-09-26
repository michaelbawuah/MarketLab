import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResearch } from '../../lib/finance/research.ts';
import { loadNative,verifyNative } from '../../services/research/native.ts';
import { ComputePool } from '../../services/research/pool.ts';
import { researchFixture } from '../fixtures/research.ts';
const addon=loadNative();
test('persistent workers preserve canonical accounting and verify all nine risk results',async()=>{
  const snapshot=await researchFixture(),expected=analyzeResearch(snapshot),pool=new ComputePool(2,'cpp-verify');
  try{const results=await Promise.all([pool.run(snapshot),pool.run(snapshot)]);for(const r of results){assert.deepEqual(r.analysis,expected);assert.equal(r.verification.comparisons,9);}assert.equal(verifyNative(expected,addon).comparisons,9);assert.deepEqual((await pool.run(snapshot)).analysis,expected);}finally{await pool.close();}
});
test('timed-out workers are replaced and pool capacity recovers',async()=>{
  const snapshot=await researchFixture(),pool=new ComputePool(1,'typescript',1);try{await assert.rejects(pool.run(snapshot),/timed out/);pool.timeoutMs=30000;assert.equal(pool.available,1);assert.deepEqual((await pool.run(snapshot)).analysis,analyzeResearch(snapshot));}finally{await pool.close();}
});
