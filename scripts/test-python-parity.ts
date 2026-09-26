import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeResearch, researchFingerprint, type ResearchSnapshot } from '../lib/finance/research.ts';
import { researchFixture } from '../tests/fixtures/research.ts';
import { researchCertificate } from '../lib/finance/confidence.ts';
import { DEMO_COSTS,demoSnapshot } from '../lib/finance/quick-demo.ts';

const directory=await mkdtemp(join(tmpdir(),'marketlab-python-parity-'));
try {
  const snapshots:{name:string;snapshot:ResearchSnapshot}[]=[];
  for(const name of ['split-dividend','costs','reverse-split','separate-benchmark','provider']) {
    const frozen=JSON.parse(await readFile(new URL(`../verification/python/fixtures/${name}.json`,import.meta.url),'utf8'));
    assert.deepEqual(analyzeResearch(frozen.snapshot),frozen.analysis,`${name}: canonical engine changed from the frozen fixture`);
    snapshots.push({name,snapshot:frozen.snapshot});
  }
  const large=await researchFixture(2500);
  // Use the maximum window with sufficient warmup and two chronological segments.
  large.config.window=500;large.config.start=large.asset.dataset.observations[500].date;
  snapshots.push({name:'2500-observations-window-500',snapshot:large});
  for(const cost of DEMO_COSTS)snapshots.push({name:`quick-demo-${cost.id}`,snapshot:await demoSnapshot(cost.id)});
  let fields=0;
  for(const {name,snapshot} of snapshots) {
    const report={format:'marketlab-research-v1',id:await researchFingerprint(snapshot),snapshot,analysis:analyzeResearch(snapshot)};
    const exported={...report,confidence:researchCertificate(report)};
    assert.ok(exported.confidence.checks.every(check=>check.status!=='failed'),`${name}: certificate consistency check failed`);
    const path=join(directory,`${name}.json`);await writeFile(path,JSON.stringify(exported),{mode:0o600});
    const child=spawnSync('python3',['verification/python/verify_research.py',path],{encoding:'utf8',timeout:30000,maxBuffer:128*1024});
    if(child.error||child.status!==0)throw new Error(`Python replay failed for ${name}: ${child.error?.message??child.stderr}`);
    const receipt=JSON.parse(child.stdout);assert.equal(receipt.verified,true);assert.equal(receipt.id,report.id);fields+=receipt.comparedFields;
    console.log(`${name}: Python independently matched ${receipt.comparedFields} fields`);
  }
  console.log(`Verified ${snapshots.length} freshly computed TypeScript reports; ${fields} scalar comparisons.`);
} finally { await rm(directory,{recursive:true,force:true}); }
