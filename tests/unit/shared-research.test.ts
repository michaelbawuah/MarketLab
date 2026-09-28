import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResearch,researchFingerprint } from '../../lib/finance/research.ts';
import { publicResearch } from '../../lib/finance/shared-research.ts';
import { workspaceOwner,WorkspaceAccessError } from '../../lib/workspace-access.ts';
import { researchFixture } from '../fixtures/research.ts';

test('public report allowlist excludes private names, source labels, input hashes and unknown metadata',async()=>{
  const snapshot=await researchFixture();snapshot.config.name='PRIVATE_OWNER_NAME';snapshot.asset.dataset.source='PRIVATE_FILE_NAME';snapshot.asset.actions.source='PRIVATE_EVENT_SOURCE';
  const id=await researchFingerprint(snapshot),analysis=analyzeResearch(snapshot);
  Object.assign(analysis.full.strategy.history[0],{account:'PRIVATE_ACCOUNT'});
  Object.assign(analysis.full.strategy.trades[0],{reference:'PRIVATE_REFERENCE'});
  const run={id,name:'PRIVATE_RUN_NAME',created:'2026-09-26',symbol:'XTEST',benchmark:'XTEST',start:snapshot.config.start,end:snapshot.config.end,snapshot,analysis};
  const before=JSON.stringify(run),report=publicResearch(run),serialized=JSON.stringify(report);
  assert.ok(!serialized.includes('PRIVATE_'));assert.ok(!serialized.includes(id));assert.ok(!serialized.includes(snapshot.asset.dataset.id));
  assert.equal(report.analysis.full.strategy.history.at(-1)!.value,analysis.full.strategy.history.at(-1)!.value);
  assert.equal(report.analysis.full.strategy.trades.length,analysis.full.strategy.trades.length);
  assert.equal(report.certificates.full.classification,'Fictional inputs');
  assert.equal(report.certificates.full.checks.at(-1)!.status,'not_run');
  assert.equal(JSON.stringify(run),before);
});
test('inconsistent saved results cannot earn a public sharing preview',async()=>{
  const snapshot=await researchFixture(),analysis=analyzeResearch(snapshot);analysis.full.strategy.history[0].value='1';
  assert.throws(()=>publicResearch({id:'a'.repeat(64),name:'Fixture',created:'2026-09-26',symbol:'XTEST',benchmark:'XTEST',start:snapshot.config.start,end:snapshot.config.end,snapshot,analysis}),/review before sharing/);
});
test('each verified identity owns its workspace and anonymous production requests fail closed',()=>{
  assert.throws(()=>workspaceOwner(null),e=>e instanceof WorkspaceAccessError&&e.status===401);
  assert.equal(workspaceOwner('stable-site-owner'),'stable-site-owner');
  assert.equal(workspaceOwner('new-user'),'new-user');
  assert.equal(workspaceOwner('workos:client_test:user_one'),'workos:client_test:user_one');
  assert.equal(workspaceOwner(null,true),'local-preview');
});
