import { Worker } from 'node:worker_threads';
import { JobStore } from '../../services/research/store.ts';
import { ComputePool } from '../../services/research/pool.ts';
import { JobRunner } from '../../services/research/runner.ts';

const [uri,name]=process.argv.slice(2);
const store=new JobStore(uri,name);await store.initialize();
const barrier=new Int32Array(new SharedArrayBuffer(4));
const pool=new ComputePool(1,'typescript',30000,()=>new Worker(new URL('./crash-worker.ts',import.meta.url),{workerData:{barrier:barrier.buffer}}));
const runner=new JobRunner(store,pool,1000);
const monitor=setInterval(()=>{
  if(Atomics.load(barrier,0)===1){clearInterval(monitor);process.send!({type:'calculated-before-finalization'});}
},10);
runner.start();
