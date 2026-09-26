import { Worker } from 'node:worker_threads';
import type { ResearchAnalysis,ResearchSnapshot } from '../../lib/finance/research.ts';
import type { Verification } from './store.ts';
export type ComputeResult={analysis:ResearchAnalysis;verification:Verification};
type Slot={worker:Worker;pending?:{resolve:(value:ComputeResult)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}};
export type WorkerFactory=(mode:string)=>Worker;
const createComputeWorker:WorkerFactory=mode=>new Worker(new URL('./compute-worker.ts',import.meta.url),{workerData:{mode},resourceLimits:{maxOldGenerationSizeMb:128}});
export class CalculationError extends Error {}
export class ComputePool {
  slots:Slot[]=[];mode:string;timeoutMs:number;closed=false;workerFactory:WorkerFactory;
  constructor(size=2,mode='cpp-verify',timeoutMs=30000,workerFactory:WorkerFactory=createComputeWorker){this.mode=mode;this.timeoutMs=timeoutMs;this.workerFactory=workerFactory;for(let i=0;i<size;i++)this.slots.push(this.spawn());}
  get available(){return this.slots.filter(s=>!s.pending).length;}
  private spawn():Slot {
    const slot:Slot={worker:this.workerFactory(this.mode)};
    slot.worker.on('message',(result:ComputeResult&{error?:string})=>{const p=slot.pending;if(!p)return;clearTimeout(p.timer);slot.pending=undefined;if(result.error)p.reject(new CalculationError(result.error));else p.resolve(result);});
    slot.worker.on('error',()=>this.replace(slot,new Error('Calculation worker failed.')));
    slot.worker.on('exit',code=>{if(code!==0)this.replace(slot,new Error('Calculation worker exited.'));});
    return slot;
  }
  private replace(slot:Slot,error:Error){const index=this.slots.indexOf(slot);if(index<0)return;const p=slot.pending;if(p){clearTimeout(p.timer);slot.pending=undefined;p.reject(error);}this.slots.splice(index,1);void slot.worker.terminate();if(!this.closed)this.slots.push(this.spawn());}
  run(snapshot:ResearchSnapshot):Promise<ComputeResult> {
    if(this.closed)return Promise.reject(new Error('Calculation pool is closed.'));
    const slot=this.slots.find(s=>!s.pending);if(!slot)return Promise.reject(new Error('Calculation pool is busy.'));
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.replace(slot,new Error('Calculation timed out.')),this.timeoutMs);slot.pending={resolve,reject,timer};try{slot.worker.postMessage({snapshot});}catch{this.replace(slot,new Error('Calculation could not start.'));}});
  }
  async close(){this.closed=true;const slots=this.slots.slice();for(const slot of slots)this.replace(slot,new Error('Calculation pool is closing.'));await Promise.all(slots.map(s=>s.worker.terminate()));}
}
