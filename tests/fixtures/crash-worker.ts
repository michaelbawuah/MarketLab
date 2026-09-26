// Fault injection stays in test code: finish canonical calculation, then block
// before returning it to the runner. SIGKILL destroys this unsaved result.
import { parentPort,workerData } from 'node:worker_threads';
import { analyzeResearch } from '../../lib/finance/research.ts';
import { validateResearchSnapshot } from '../../lib/finance/research-input.ts';

const barrier=new Int32Array(workerData.barrier);
parentPort!.on('message',async({snapshot})=>{
  const analysis=analyzeResearch(await validateResearchSnapshot(snapshot));
  Atomics.store(barrier,0,1);
  Atomics.wait(barrier,0,1);
  parentPort!.postMessage({analysis,verification:{engine:'test-reference',comparisons:0,maxAbsoluteError:0}});
});
