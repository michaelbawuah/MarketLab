import { ComputePool,CalculationError } from './pool.ts';
import { JobStore,ServiceError,type Job } from './store.ts';
export class JobRunner {
  store:JobStore;pool:ComputePool;leaseMs:number;timer?:NodeJS.Timeout;polling=false;closed=false;active=new Set<Promise<void>>();
  constructor(store:JobStore,pool:ComputePool,leaseMs=60000){this.store=store;this.pool=pool;this.leaseMs=leaseMs;}
  start(){this.timer=setInterval(()=>void this.tick(),250);void this.tick();}
  async tick(){if(this.polling||this.closed)return;this.polling=true;try{while(!this.closed&&this.pool.available){const job=await this.store.claim(this.leaseMs);if(!job)break;const work=this.execute(job);this.active.add(work);void work.finally(()=>this.active.delete(work));}}catch{console.error('research_queue_unavailable');}finally{this.polling=false;}}
  private async execute(job:Job){
    let heartbeatPending=false;
    const heartbeat=setInterval(()=>{if(heartbeatPending)return;heartbeatPending=true;void this.store.heartbeat(job,this.leaseMs).then(owned=>{if(!owned)clearInterval(heartbeat);}).catch(()=>{}).finally(()=>{heartbeatPending=false;});},Math.floor(this.leaseMs/3));
    try{const result=await this.pool.run(JSON.parse(job.snapshot));await this.store.complete(job,result.analysis,result.verification);}
    catch(e){const permanent=e instanceof CalculationError||e instanceof ServiceError;try{await this.store.fail(job,permanent?'calculation_rejected':'worker_interrupted',permanent?(e as Error).message:'Calculation interrupted; automatic retry is bounded to three attempts.',!permanent);}catch{console.error('research_job_finalization_unavailable');}}
    finally{clearInterval(heartbeat);}
  }
  async close(){this.closed=true;if(this.timer)clearInterval(this.timer);while(this.polling)await new Promise(r=>setTimeout(r,10));await this.pool.close();await Promise.all(this.active);}
}
