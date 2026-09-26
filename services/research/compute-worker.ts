import { parentPort,workerData } from 'node:worker_threads';
import { analyzeResearch } from '../../lib/finance/research.ts';
import { validateResearchSnapshot } from '../../lib/finance/research-input.ts';
import { loadNative,verifyNative } from './native.ts';
const addon=workerData.mode==='cpp-verify'?loadNative():null;
parentPort!.on('message',async({snapshot})=>{
  try{const analysis=analyzeResearch(await validateResearchSnapshot(snapshot)),verification=addon?verifyNative(analysis,addon):{engine:'typescript-reference',comparisons:0,maxAbsoluteError:0};parentPort!.postMessage({analysis,verification});}
  catch(e){parentPort!.postMessage({error:(e as Error).message.slice(0,240)});}
});
