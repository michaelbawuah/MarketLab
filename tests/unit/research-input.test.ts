import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResearchSnapshot } from '../../lib/finance/research-input.ts';
import { researchFixture } from '../fixtures/research.ts';
test('export trust boundary validates complete observations and metadata',async()=>{
  const fixture=await researchFixture();assert.equal(await validateResearchSnapshot(fixture),fixture);const bad=structuredClone(fixture);bad.asset.dataset.observations.reverse();await assert.rejects(validateResearchSnapshot(bad),/ordered/);const edited=structuredClone(fixture);edited.asset.dataset.observations[2].priceMicros='121000000';await assert.rejects(validateResearchSnapshot(edited),/fingerprint/);const count=structuredClone(fixture);count.asset.dataset.count=900;await assert.rejects(validateResearchSnapshot(count),/snapshot/);
});
for(const origin of ['alphavantage','alphavantage-browser'] as const)test(`${origin} snapshot hashes include frozen provider provenance`,async()=>{
  const snapshot=await researchFixture(),d=snapshot.asset.dataset,provenance={origin,refreshed:d.lastDate,timezone:'US/Eastern'};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['marketlab-provider-v1',d.id,provenance])));
  d.id=Buffer.from(digest).toString('hex');d.origin=origin;d.providerRefreshed=provenance.refreshed;d.providerTimezone=provenance.timezone;snapshot.config.assetId=d.id;snapshot.config.benchmarkId=d.id;
  assert.equal(await validateResearchSnapshot(snapshot),snapshot);
  d.origin=origin==='alphavantage'?'alphavantage-browser':'alphavantage';await assert.rejects(validateResearchSnapshot(snapshot),/fingerprint/);d.origin=origin;
  d.providerTimezone='UTC';await assert.rejects(validateResearchSnapshot(snapshot),/fingerprint/);
});
