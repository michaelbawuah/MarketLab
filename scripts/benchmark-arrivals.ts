/** Fixed-arrival load; no arrival waits for a job to finish. Local evidence only. */
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { cpus,availableParallelism,release,totalmem } from 'node:os';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { MongoClient } from 'mongodb';
import { signResearchRequest } from '../lib/research-signing.ts';
import { workloadProfiles,prepareJobs,assertCorrectResult,WORKLOAD_VERSION,type PreparedJob } from './benchmark/workload.ts';
import { distribution } from './benchmark/statistics.ts';
import { startMongo,startService,messageFrom } from './benchmark/processes.ts';
import { sourceManifest } from './benchmark-service.ts';

type Options={baseline:number;overload:number;seconds:number;repetitions:number;workers:number;warmup:number;pollMs:number;dispatchLimit:number;pollers:number;drainSeconds:number;recovery:boolean;output:string};
export function parseArrivalOptions(args:string[]):Options{
  const o:Options={baseline:20,overload:80,seconds:15,repetitions:3,workers:2,warmup:32,pollMs:100,dispatchLimit:64,pollers:8,drainSeconds:120,recovery:true,output:''},seen=new Set<string>();
  const bounds={baseline:[1,200],overload:[1,200],seconds:[1,30],repetitions:[1,5],workers:[1,8],warmup:[8,64],pollMs:[20,1000],dispatchLimit:[1,128],pollers:[1,16],drainSeconds:[70,180]};
  for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,''),value=args[i+1];if(!args[i]?.startsWith('--')||!value||seen.has(key))throw new Error('Use unique --option value pairs.');seen.add(key);
    if(key==='output')o.output=resolve(value);else if(key==='recovery'&&['true','false'].includes(value))o.recovery=value==='true';
    else if(key in bounds){const k=key as keyof typeof bounds,n=Number(value),[min,max]=bounds[k];if(!/^\d+$/.test(value)||!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`Invalid ${key}.`);o[k]=n;}else throw new Error('Unknown arrival option.');
  }
  if(!o.output||o.baseline>=o.overload)throw new Error('Provide a new output directory and baseline < overload.');return o;
}
type Sample={index:number;id:string;owner:string;profile:number;scheduledMs:number;dispatchMs?:number;submitResponseMs?:number;latenessMs:number;outcome:'driver_dropped'|'admitted'|'capacity_rejected'|'other_rejected'|'transport_ambiguous';httpStatus?:number;code?:string;retryAfter?:string|null;polls:number;nextPoll:number;checking?:boolean;terminal?:'verified'|'failed'|'invalid';verifiedMs?:number;attempts?:number;error?:string;timing?:{admittedAt:string;firstClaimedAt:string;attemptStartedAt:string;completedAt:string};queueMs?:number;residenceMs?:number;finalAttemptMs?:number};
async function optional(path:string){try{return(await readFile(path,'utf8')).trim();}catch{return null;}}
async function request(origin:string,secret:string,job:PreparedJob,method:string,path:string){
  const body=method==='POST'?job.body:'',headers=await signResearchRequest(secret,job.owner,method,path,body);
  const response=await fetch(origin+path,{method,headers:{...headers,'Content-Type':'application/json'},body:body||undefined,redirect:'error',signal:AbortSignal.timeout(10000)});
  const raw=await response.text();return {status:response.status,code:response.headers.get('retry-after'),data:JSON.parse(raw)};
}
async function warm(origin:string,secret:string,jobs:PreparedJob[]){
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{while(next<jobs.length){const j=jobs[next++];const res=await request(origin,secret,j,'POST','/v1/jobs');if(res.status!==202||res.data.job?.id!==j.id)throw new Error('Warm-up admission failed.');const end=performance.now()+15000;
    while(true){const s=await request(origin,secret,j,'GET',`/v1/jobs/${j.id}/status`);if(s.data.job?.status==='completed')break;if(performance.now()>end||s.data.job?.status==='failed')throw new Error('Warm-up completion failed.');await delay(50);}
    const result=await request(origin,secret,j,'GET',`/v1/jobs/${j.id}`);assertCorrectResult(result.data.job,j,'cpp-verify');
  }}));
}
async function trial(options:Options,rate:number,label:string,recover:boolean,profiles:Awaited<ReturnType<typeof workloadProfiles>>){
  const jobs=await prepareJobs(profiles,rate*options.seconds,label),owners=Math.ceil(jobs.length/25);
  // Stripe arrivals over owners; each still has <=25 lifetime jobs.
  for(const job of jobs)job.owner=`${label}-owner-${job.index%owners}`;
  const mongo=await startMongo(process.env.MONGOD_BIN||'mongod'),database=`marketlab_benchmark_${randomUUID().replaceAll('-','')}`,secret=randomBytes(32).toString('hex');
  const inspector=new MongoClient(mongo.uri,{timeoutMS:5000}),config={uri:mongo.uri,database,secret,host:'127.0.0.1',port:0,workers:options.workers,mode:'cpp-verify' as const,admission:{global:64,perOwner:4}};
  let service:Awaited<ReturnType<typeof startService>>|undefined,sampling=true,polling=true;
  const pending=new Map<number,Sample>();
  const samples:Sample[]=[],queueSamples:Array<{atMs:number;queued:number;running:number;active:number;driverRss:number;serviceRss:number|null;mongoRss:number|null}>=[],serviceMetrics:unknown[]=[];
  let sampler:Promise<void>|undefined,pollTasks:Promise<void>[]=[];
  try{
    await inspector.connect();const mongoVersion=(await inspector.db('admin').command({buildInfo:1})).version;
    let mongoMemorySampling:{available:boolean;errorCode?:number;reason?:string}={available:true};
    try{await inspector.db('admin').command({serverStatus:1});}catch(e){if((e as {code?:number}).code!==13538)throw e;mongoMemorySampling={available:false,errorCode:13538,reason:'Managed runtime /proc namespace is unavailable to Mongo serverStatus; Mongo RSS is unknown.'};}
    service=await startService(config);const warmJobs=await prepareJobs(profiles,options.warmup,label+'-warm');for(const j of warmJobs)j.owner=`${label}-warm-${j.index%Math.ceil(warmJobs.length/25)}`;
    await warm(service.origin,secret,warmJobs);
    let measuring=messageFrom(service.child,'measuring');service.child.send({type:'measure'});await measuring;
    const cpu=process.cpuUsage(),started=performance.now(),measuredAt=new Date().toISOString();
    const inflight=new Set<Promise<void>>();let samplingErrors=0,transportPollErrors=0,peakDispatch=0,crash:Record<string,unknown>|undefined;
    sampler=(async()=>{while(sampling){try{const rows=await inspector.db(database).collection('research_jobs').aggregate<{_id:string;count:number}>([{$match:{status:{$in:['queued','running']}}},{$group:{_id:'$status',count:{$sum:1}}}]).toArray();const queued=rows.find(r=>r._id==='queued')?.count??0,running=rows.find(r=>r._id==='running')?.count??0;
      const mongoStatus=mongoMemorySampling.available?await inspector.db('admin').command({serverStatus:1}):null;
      let serviceRss:number|null=null;const currentService=service!;
      if(currentService.child.connected&&currentService.child.exitCode===null&&currentService.child.signalCode===null){try{const sampled=messageFrom<{type:string;rssBytes:number}>(currentService.child,'sample');currentService.child.send({type:'sample'});serviceRss=(await sampled).rssBytes;}catch{/* A crash can invalidate this one RSS observation. */}}
      queueSamples.push({atMs:performance.now()-started,queued,running,active:queued+running,driverRss:process.memoryUsage().rss,serviceRss,mongoRss:Number.isFinite(mongoStatus?.mem?.resident)?mongoStatus!.mem.resident*1024*1024:null});
    }catch{samplingErrors++;}await delay(250);}})();
    const poll=async()=>{while(polling||pending.size){const now=performance.now(),entry=[...pending.values()].find(s=>!s.checking&&s.nextPoll<=now);if(!entry){await delay(10);continue;}entry.checking=true;const expected=jobs[entry.index];
      try{entry.polls++;const status=await request(service!.origin,secret,expected,'GET',`/v1/jobs/${expected.id}/status`);
        if(status.status!==200||status.data.job?.id!==expected.id)throw new Error('Status response mismatch.');
        if(status.data.job.status==='failed'){entry.terminal='failed';entry.error='Service job failed.';pending.delete(entry.index);}
        else if(status.data.job.status==='completed'){const result=await request(service!.origin,secret,expected,'GET',`/v1/jobs/${expected.id}`);
          try{if(result.status!==200)throw new Error('Result HTTP failure.');assertCorrectResult(result.data.job,expected,'cpp-verify',recover?3:1);
            const timing=result.data.job.timing,dates=[timing?.admittedAt,timing?.firstClaimedAt,timing?.attemptStartedAt,timing?.completedAt].map((v:unknown)=>typeof v==='string'?Date.parse(v):NaN);
            if(dates.some(d=>!Number.isFinite(d))||dates.some((d,i)=>i>0&&d<dates[i-1]))throw new Error('Database timing order failed.');
            entry.timing=timing;entry.queueMs=dates[1]-dates[0];entry.residenceMs=dates[3]-dates[0];entry.finalAttemptMs=dates[3]-dates[2];entry.attempts=result.data.job.attempts;entry.terminal='verified';entry.verifiedMs=performance.now()-started;
          }catch(e){entry.terminal='invalid';entry.error=(e as Error).message;}pending.delete(entry.index);
        }else if(!['queued','running'].includes(status.data.job.status)){entry.terminal='invalid';entry.error='Unknown job state.';pending.delete(entry.index);}
      }catch{transportPollErrors++;}finally{entry.nextPoll=performance.now()+options.pollMs;entry.checking=false;}
    }};
    pollTasks=Array.from({length:options.pollers},poll);
    for(const expected of jobs){const scheduledMs=expected.index*1000/rate,wait=started+scheduledMs-performance.now();if(wait>0)await delay(wait);const dispatchMs=performance.now()-started,latenessMs=Math.max(0,dispatchMs-scheduledMs);
      const sample:Sample={index:expected.index,id:expected.id,owner:expected.owner,profile:expected.profile,scheduledMs,latenessMs,outcome:'driver_dropped',polls:0,nextPoll:0};samples.push(sample);
      // Drop late arrivals instead of generating a hidden catch-up burst.
      if(latenessMs>50||inflight.size>=options.dispatchLimit){sample.error=latenessMs>50?'Arrival was more than 50 ms late.':'Dispatch concurrency limit reached.';continue;}
      sample.dispatchMs=dispatchMs;sample.outcome='transport_ambiguous';
      const work=(async()=>{try{const response=await request(service!.origin,secret,expected,'POST','/v1/jobs');sample.submitResponseMs=performance.now()-started;sample.httpStatus=response.status;sample.code=response.data.code;sample.retryAfter=response.code;
        if(response.status===202&&response.data.job?.id===expected.id){sample.outcome='admitted';sample.nextPoll=performance.now();pending.set(expected.index,sample);}
        else if([429,503].includes(response.status)&&['owner_capacity','global_capacity'].includes(response.data.code)&&response.code==='2')sample.outcome='capacity_rejected';
        else{sample.outcome='other_rejected';sample.error='Unexpected submission response.';}
      }catch{sample.error='Submission transport failed; acknowledgement unknown.';}})();inflight.add(work);peakDispatch=Math.max(peakDispatch,inflight.size);void work.finally(()=>inflight.delete(work));
    }
    const remaining=started+options.seconds*1000-performance.now();if(remaining>0)await delay(remaining);
    await Promise.all(inflight);const arrivalsEndedMs=performance.now()-started;
    if(recover){
      const metrics=messageFrom(service.child,'metrics');service.child.send({type:'metrics'});serviceMetrics.push(await metrics);
      // Pause after real calculation so SIGKILL cannot land in an idle gap.
      const barrier=messageFrom(service.child,'crash-barrier');service.child.send({type:'arm-crash'});await barrier;
      const occupancy=await inspector.db(database).collection('research_jobs').aggregate<{_id:string;count:number}>([{$match:{status:{$in:['queued','running']}}},{$group:{_id:'$status',count:{$sum:1}}}]).toArray(),active=occupancy.reduce((n,r)=>n+r.count,0),running=occupancy.find(r=>r._id==='running')?.count??0;
      const killedAtMs=performance.now()-started,oldPid=service.child.pid!,exited=new Promise<NodeJS.Signals|null>(r=>service!.child.once('exit',(_code,signal)=>r(signal)));
      service.child.kill('SIGKILL');const signal=await exited;
      service=await startService(config);measuring=messageFrom(service.child,'measuring');service.child.send({type:'measure'});await measuring;
      crash={activeAtKill:active,runningAtKill:running,oldPid,signal,killedAtMs,restartedAtMs:performance.now()-started,leaseMs:60000,unchangedConfiguration:true,barrier:'Local helper pauses finalization after real calculation; production has no hook.'};
    }
    const deadline=performance.now()+options.drainSeconds*1000;
    while(pending.size&&performance.now()<deadline)await delay(100);
    polling=false;
    pending.clear();await Promise.all(pollTasks);sampling=false;await sampler;
    const durationMs=performance.now()-started,usage=process.cpuUsage(cpu),metrics=messageFrom(service.child,'metrics');service.child.send({type:'metrics'});serviceMetrics.push(await metrics);
    const rows=await inspector.db(database).collection('research_jobs').find({owner:{$regex:`^${label}-owner-`}},{projection:{owner:1,id:1,status:1,attempts:1,globalSlot:1,activeSlot:1}}).toArray();
    const accepted=samples.filter(s=>s.outcome==='admitted'),expected=new Set(accepted.map(s=>`${s.owner}:${s.id}`));
    const durable=rows.length===accepted.length&&rows.every(r=>expected.delete(`${r.owner}:${r.id}`)&&r.status==='completed'&&r.attempts>=1&&r.attempts<=(recover?3:1)&&r.globalSlot===undefined&&r.activeSlot===undefined)&&expected.size===0;
    const count=(outcome:Sample['outcome'])=>samples.filter(s=>s.outcome===outcome).length;
    const counts={offered:jobs.length,dispatched:samples.filter(s=>s.dispatchMs!==undefined).length,driverDropped:count('driver_dropped'),admitted:accepted.length,capacityRejected:count('capacity_rejected'),otherRejected:count('other_rejected'),transportAmbiguous:count('transport_ambiguous'),completedAndVerified:accepted.filter(s=>s.terminal==='verified').length,terminalFailed:accepted.filter(s=>s.terminal==='failed').length,invalidResults:accepted.filter(s=>s.terminal==='invalid').length,unresolved:accepted.filter(s=>!s.terminal).length};
    const successful=accepted.filter(s=>s.terminal==='verified'),recovered=successful.filter(s=>s.attempts!>1),late=distribution(samples.map(s=>s.latenessMs)),sampledPeakActive=Math.max(0,...queueSamples.map(s=>s.active));
    const gates={generator:counts.driverDropped===0&&(late?.p99Ms??Infinity)<=50,accounting:counts.offered===counts.driverDropped+counts.admitted+counts.capacityRejected+counts.otherRejected+counts.transportAmbiguous&&counts.admitted===counts.completedAndVerified+counts.terminalFailed+counts.invalidResults+counts.unresolved,correctness:durable&&counts.completedAndVerified===counts.admitted&&counts.terminalFailed===0&&counts.invalidResults===0&&counts.unresolved===0,transport:counts.otherRejected===0&&counts.transportAmbiguous===0&&(!recover?transportPollErrors===0:true),sampling:samplingErrors===0&&queueSamples.some(q=>(q.serviceRss??0)>0)&&(mongoMemorySampling.available?queueSamples.some(q=>(q.mongoRss??0)>0):true),bounds:sampledPeakActive<=64,phase:label.startsWith('baseline')?counts.capacityRejected===0:counts.capacityRejected>0,recovery:!recover||(crash?.signal==='SIGKILL'&&Number(crash.activeAtKill)>0&&Number(crash.runningAtKill)>0&&rows.some(r=>r.attempts>1))};
    return {label,rate,measuredAt,mongoVersion,mongoMemorySampling,arrivalWindowMs:options.seconds*1000,arrivalsEndedMs,durationMs,counts,gates,valid:Object.values(gates).every(Boolean),durableResultsVerified:durable,persistedMeasuredJobs:rows.length,recoveredJobs:recovered.length,recoveredLatency:distribution(recovered.map(s=>s.verifiedMs!-s.scheduledMs)),restartToLastRecoveredObservedMs:recovered.length?Math.max(...recovered.map(s=>s.verifiedMs!))-Number(crash?.restartedAtMs):null,peakDispatch,sampledPeakActive,samplingErrors,transportPollErrors,crash,serviceMetrics,driverCpu:{userMs:usage.user/1000,systemMs:usage.system/1000},latency:{population:'Verified admitted jobs only; rejected, dropped, ambiguous, failed and unresolved counts are separate.',arrivalLateness:late,submit:distribution(samples.filter(s=>s.submitResponseMs!==undefined).map(s=>s.submitResponseMs!-s.dispatchMs!)),scheduledToVerified:distribution(successful.map(s=>s.verifiedMs!-s.scheduledMs)),dispatchedToVerified:distribution(successful.map(s=>s.verifiedMs!-s.dispatchMs!)),initialQueue:distribution(successful.map(s=>s.queueMs!)),residence:distribution(successful.map(s=>s.residenceMs!)),finalAttemptWallTime:distribution(successful.map(s=>s.finalAttemptMs!))},queueSamples,samples};
  }finally{polling=false;sampling=false;pending.clear();await Promise.all(pollTasks);await sampler;if(service)await service.close();await inspector.close();await mongo.close();}
}
export async function benchmarkArrivals(options:Options){
  await mkdir(options.output);const source=await sourceManifest(),profiles=await workloadProfiles(500);
  const environment={node:process.version,mongo:'8.0.17 (actual version also recorded per trial)',kernel:release(),platform:process.platform,architecture:process.arch,cpuModel:cpus()[0]?.model,visibleLogicalCpus:cpus().length,availableParallelism:availableParallelism(),hostVisibleMemoryBytes:totalmem(),cgroupCpuMax:await optional('/sys/fs/cgroup/cpu.max'),cgroupMemoryMax:await optional('/sys/fs/cgroup/memory.max'),cgroupCpuSet:await optional('/sys/fs/cgroup/cpuset.cpus.effective'),sharedMachine:true,mongoMemoryLimitations:'If serverStatus cannot access its managed /proc namespace (code 13538), RSS is explicitly unavailable, not zero.'};
  await writeFile(join(options.output,'manifest.json'),JSON.stringify({format:'marketlab-fixed-arrival-v1',source,environment,options,admission:{global:64,perOwner:4}},null,2)+'\n',{flag:'wx'});
  await writeFile(join(options.output,'workload.json'),JSON.stringify({version:WORKLOAD_VERSION,profiles:profiles.map(p=>({snapshot:p.snapshot,expectedAnalysisSha256:p.analysisHash}))},null,2)+'\n',{flag:'wx'});
  const trials=[];
  try{
    for(let i=1;i<=options.repetitions;i++)for(const [kind,rate] of [['baseline',options.baseline],['overload',options.overload]] as const){console.log(`${kind}-${i}: ${rate}/s for ${options.seconds}s, independent arrivals.`);const t=await trial(options,rate,`${kind}-${i}`,false,profiles);trials.push(t);await writeFile(join(options.output,`${t.label}.json`),JSON.stringify(t,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({label:t.label,counts:t.counts,peak:t.sampledPeakActive,gates:t.gates}));if(!t.valid)throw new Error(`${t.label} acceptance gate failed; raw evidence retained.`);}
    if(options.recovery){console.log('Recovery: overload, stop arrivals, SIGKILL service, retain MongoDB, restart unchanged configuration.');const t=await trial(options,options.overload,'recovery',true,profiles);trials.push(t);await writeFile(join(options.output,'recovery.json'),JSON.stringify(t,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({label:t.label,counts:t.counts,crash:t.crash,gates:t.gates}));if(!t.valid)throw new Error('Recovery gate failed; raw evidence retained.');}
    const report={format:'marketlab-fixed-arrival-v1',valid:true,source,environment,options,admission:{global:64,perOwner:4},method:{arrivals:'i/rate on a monotonic clock; submission/completion never schedules the next arrival. Late >50ms or dispatch-limit arrivals are counted as driver drops; no catch-up queue.',timing:'Scheduled/dispatched to full HTTP result hash and native-receipt verification. DB-clock fields separate first queue wait, total residence and final-attempt wall time. The latter includes worker/IPC/persistence, not pure compute.',population:'Successful admitted jobs only for result latency. All offered outcomes and unresolved jobs are counted. Nearest-rank percentiles.',resources:'Separate Node service process and standalone loopback MongoDB per trial. Queue, service RSS via IPC and Mongo resident memory via serverStatus sampled every 250ms; service CPU/event-loop diagnostics measured via IPC. Unavailable Mongo RSS is reported explicitly; warm-up excluded; shared-machine contention remains.',recovery:'Crash occurs after arrivals stop and submission acknowledgements settle, at a benchmark-only after-calculation/before-finalization barrier; running leases expire naturally after 60s. No manual requeue or shortened production lease.',limits:'Short local overload experiments; not production capacity, an HFT latency claim, replica failover, browser/Workers/TLS testing, independent Python replay or a pilot.'},trials:trials.map(t=>({...t,samples:undefined,queueSamples:undefined,samplesFile:t.label+'.json'}))};
    await writeFile(join(options.output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
  }catch(e){await writeFile(join(options.output,'failure.json'),JSON.stringify({valid:false,error:(e as Error).message,completedTrials:trials.length},null,2)+'\n',{flag:'wx'});throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{await benchmarkArrivals(parseArrivalOptions(process.argv.slice(2)));}catch(e){console.error((e as Error).message);process.exitCode=1;}}
