import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { observedMetrics,analyzeResearch } from '../lib/finance/research.ts';
import { loadNative } from '../services/research/native.ts';
import { ComputePool } from '../services/research/pool.ts';
import { researchFixture } from '../tests/fixtures/research.ts';
const size=2500,a=Array.from({length:size},(_,i)=>100000+Math.sin(i*.31)*900+i*.4),b=Array.from({length:size},(_,i)=>120000+Math.cos(i*.19)*700+i*.2),ta=Float64Array.from(a),tb=Float64Array.from(b);
const child=process.argv.find(s=>s.startsWith('--child='))?.split('=')[1];
const summarize=(samples:number[])=>{const sorted=samples.slice().sort((x,y)=>x-y);return {medianMs:sorted[Math.floor(sorted.length/2)],minMs:sorted[0],maxMs:sorted.at(-1),batches:samples.length};};
if(child){
  const addon=child==='typescript'?null:loadNative(),call=()=>child==='typescript'?observedMetrics(a,b):addon!.observedMetrics(child==='cpp-packed'?Float64Array.from(a):ta,child==='cpp-packed'?Float64Array.from(b):tb);
  for(let i=0;i<300;i++)call();const samples=[];
  for(let sample=0;sample<9;sample++){const t=performance.now();for(let i=0;i<2000;i++)call();samples.push((performance.now()-t)/2000);}
  console.log(JSON.stringify({...summarize(samples),callsPerBatch:2000,peakProcessRssKiB:process.resourceUsage().maxRSS}));
}else{
  const kernel:Record<string,unknown>={};for(const mode of ['typescript','cpp','cpp-packed']){const result=spawnSync(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),`--child=${mode}`],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);kernel[mode]=JSON.parse(result.stdout);}
  const snapshot=await researchFixture(2500),direct=[];for(let i=0;i<10;i++)analyzeResearch(snapshot);for(let sample=0;sample<9;sample++){const t=performance.now();for(let i=0;i<5;i++)analyzeResearch(snapshot);direct.push((performance.now()-t)/5);}
  const worker:Record<string,unknown>={};for(const mode of ['typescript','cpp-verify']){const pool=new ComputePool(1,mode);try{for(let i=0;i<5;i++)await pool.run(snapshot);const samples=[];for(let sample=0;sample<9;sample++){const t=performance.now();for(let i=0;i<5;i++)await pool.run(snapshot);samples.push((performance.now()-t)/5);}worker[mode]=summarize(samples);}finally{await pool.close();}}
  const report={measuredAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,compiler:spawnSync(process.env.CXX||'c++',['--version'],{encoding:'utf8'}).stdout.split('\n')[0],sharedRuntime:true},observations:size,kernel,fullResearchDirect:summarize(direct),fullResearchWorker:worker,interpretation:'Kernel timings are warmed single-process microbenchmarks; packed includes conversion from JS arrays. Worker measurements include structured clone, strict input/hash validation, complete TS accounting, and result transport. cpp-verify adds independent native risk checks; it does not replace or accelerate the TS backtest. RSS is peak whole-process RSS from separate fresh processes, not native-only memory. No production latency claim.'};
  writeFileSync(new URL('../docs/native-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
