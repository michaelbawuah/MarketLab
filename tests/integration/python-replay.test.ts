import test from 'node:test';
import assert from 'node:assert/strict';
import { PythonReplay } from '../../services/research/python-replay.ts';
import { ServiceError } from '../../services/research/store.ts';
import { analyzeResearch,researchFingerprint } from '../../lib/finance/research.ts';
import { replayReportJSON,replayDigest,checkedReplayReceipt } from '../../lib/finance/replay-receipt.ts';
import { researchFixture } from '../fixtures/research.ts';

const status=(n:number)=>(e:unknown)=>e instanceof ServiceError&&e.status===n;
test('real isolated Python binds a receipt to every saved input and result; tampering cannot pass',async()=>{
  const snapshot=await researchFixture(),run={id:await researchFingerprint(snapshot),snapshot,analysis:analyzeResearch(snapshot)},raw=replayReportJSON(run),python=new PythonReplay();
  const receipt=await python.verify(Buffer.from(raw));
  assert.equal(receipt.exactAccounting,true);assert.equal(receipt.simulations,9);assert.ok(receipt.comparedFields>100);assert.equal(receipt.reportDigest,await replayDigest(raw));
  assert.deepEqual(checkedReplayReceipt(receipt,run.id,await replayDigest(raw)),receipt);
  const altered=structuredClone(run);altered.analysis.full.strategyRisk.volatilityPct=999;
  await assert.rejects(python.verify(Buffer.from(replayReportJSON(altered))),status(422));
  assert.equal(checkedReplayReceipt(receipt,run.id,await replayDigest(replayReportJSON(altered))),null);
  await assert.rejects(python.verify(Buffer.from(replayReportJSON({...run,id:'0'.repeat(64)}))),status(422));
  await assert.rejects(python.verify(Buffer.from(raw.replace('"format":','"format":"duplicate","format":'))),status(422));
  assert.equal((await python.verify(Buffer.from(raw))).verified,true,'A failed run must release capacity');
});
test('replay has one in-flight slot, bounded input and a hard subprocess timeout',async()=>{
  const snapshot=await researchFixture(),raw=Buffer.from(replayReportJSON({id:await researchFingerprint(snapshot),snapshot,analysis:analyzeResearch(snapshot)})),python=new PythonReplay();
  const running=python.verify(raw);await assert.rejects(python.verify(raw),status(429));await running;
  await assert.rejects(python.verify(Buffer.alloc(1_950_001)),status(413));
  const timeout=new PythonReplay(1);await assert.rejects(timeout.verify(raw),status(503));await assert.rejects(timeout.verify(raw),status(503));
});
