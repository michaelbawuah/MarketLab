import { researchCertificate } from '../../lib/finance/confidence.ts';
import { MongoClient, MongoServerError, type Collection } from 'mongodb';
import { randomUUID } from 'node:crypto';
import type { ResearchSnapshot, ResearchAnalysis } from '../../lib/finance/research.ts';
import { researchFingerprint } from '../../lib/finance/research.ts';

export type Verification={engine:string;comparisons:number;maxAbsoluteError:number};
export type Job={owner:string;id:string;slot:number;name:string;symbol:string;created:Date;updated:Date;status:'queued'|'running'|'completed'|'failed';attempts:number;snapshot:string;result?:string;verification?:Verification;leaseToken?:string;leaseUntil?:Date;errorCode?:string;errorMessage?:string};
export class ServiceError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const duplicate=(e:unknown)=>e instanceof MongoServerError&&e.code===11000;
export class JobStore {
  client:MongoClient;jobs:Collection<Job>;nonces:Collection<{owner:string;nonce:string;expires:Date}>;
  constructor(uri:string,name:string){this.client=new MongoClient(uri,{timeoutMS:5000,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,maxPoolSize:10,writeConcern:{w:'majority'}});const db=this.client.db(name);this.jobs=db.collection<Job>('research_jobs');this.nonces=db.collection('request_nonces');}
  async initialize(){
    await this.client.connect();const db=this.jobs.dbName;
    const validator={$jsonSchema:{bsonType:'object',required:['owner','id','slot','status','snapshot','attempts'],properties:{owner:{bsonType:'string',minLength:1,maxLength:128},id:{bsonType:'string',pattern:'^[a-f0-9]{64}$'},slot:{bsonType:'int',minimum:0,maximum:29},status:{enum:['queued','running','completed','failed']},snapshot:{bsonType:'string'},attempts:{bsonType:'int',minimum:0,maximum:3}}}};
    try{await this.client.db(db).createCollection('research_jobs',{validator});}catch(e){if(!(e instanceof MongoServerError&&e.code===48))throw e;const existing=await this.client.db(db).listCollections({name:'research_jobs'}).next();if(JSON.stringify(existing&&'options' in existing?existing.options?.validator:undefined)!==JSON.stringify(validator))throw new Error('Research collection schema requires an explicit migration.');}
    await this.jobs.createIndex({owner:1,id:1},{unique:true});await this.jobs.createIndex({owner:1,slot:1},{unique:true});await this.jobs.createIndex({status:1,leaseUntil:1,created:1});
    await this.nonces.createIndex({owner:1,nonce:1},{unique:true});await this.nonces.createIndex({expires:1},{expireAfterSeconds:0});
  }
  async consumeNonce(owner:string,nonce:string){try{await this.nonces.insertOne({owner,nonce,expires:new Date(Date.now()+180000)});}catch(e){if(duplicate(e))throw new ServiceError('Request signature has already been used.',409);throw e;}}
  async submit(owner:string,snapshot:ResearchSnapshot){
    const id=await researchFingerprint(snapshot),existing=await this.jobs.findOne({owner,id});if(existing)return existing;
    const payload=JSON.stringify(snapshot);if(Buffer.byteLength(payload)>1024*1024)throw new ServiceError('Snapshot exceeds 1 MiB.',413);
    // Unique bounded slots enforce quota without a count-then-insert race or a replica-set transaction.
    for(let slot=0;slot<30;slot++){
      const now=new Date(),job:Job={owner,id,slot,name:snapshot.config.name,symbol:snapshot.asset.dataset.symbol,created:now,updated:now,status:'queued',attempts:0,snapshot:payload};
      try{await this.jobs.insertOne(job);return job;}catch(e){if(!duplicate(e))throw e;const replay=await this.jobs.findOne({owner,id});if(replay)return replay;}
    }
    throw new ServiceError('This owner has reached the 30-job limit. Queued, failed and completed jobs all count.',409);
  }
  async get(owner:string,id:string){return this.jobs.findOne({owner,id});}
  async list(owner:string){return this.jobs.find({owner},{projection:{snapshot:0,result:0,leaseToken:0,owner:0,_id:0}}).sort({created:-1,id:1}).toArray();}
  async claim(leaseMs:number){
    // Every ownership decision uses the database clock. Client clocks may disagree.
    const expired={$expr:{$lte:['$leaseUntil','$$NOW']}};
    await this.jobs.updateMany({status:'running',...expired,attempts:{$gte:3}},[
      {$set:{status:'failed',updated:'$$NOW',errorCode:'attempts_exhausted',errorMessage:'Worker attempts exhausted.'}},
      {$unset:['leaseToken','leaseUntil']},
    ]);
    return this.jobs.findOneAndUpdate({attempts:{$lt:3},$or:[{status:'queued'},{status:'running',...expired}]},[
      {$set:{status:'running',updated:'$$NOW',leaseToken:randomUUID(),leaseUntil:{$add:['$$NOW',leaseMs]},attempts:{$add:['$attempts',1]}}},
      {$unset:['errorCode','errorMessage']},
    ],{sort:{created:1},returnDocument:'after'});
  }
  private fence(job:Job){return {owner:job.owner,id:job.id,status:'running' as const,leaseToken:job.leaseToken,$expr:{$gt:['$leaseUntil','$$NOW']}};}
  async heartbeat(job:Job,leaseMs:number){const r=await this.jobs.updateOne(this.fence(job),[{$set:{leaseUntil:{$add:['$$NOW',leaseMs]},updated:'$$NOW'}}]);return r.matchedCount===1;}
  async complete(job:Job,analysis:ResearchAnalysis,verification:Verification){
    const result=JSON.stringify(analysis);if(Buffer.byteLength(job.snapshot)+Buffer.byteLength(result)>1900000)throw new ServiceError('Combined research inputs and results exceed the saved-run size limit.');
    const r=await this.jobs.updateOne(this.fence(job),[
      {$set:{status:'completed',updated:'$$NOW',result:{$literal:result},verification:{$literal:verification}}},
      {$unset:['leaseToken','leaseUntil','errorCode','errorMessage']},
    ]);return r.modifiedCount===1;
  }
  async fail(job:Job,code:string,message:string,retry:boolean){await this.jobs.updateOne(this.fence(job),[
    {$set:{status:retry&&job.attempts<3?'queued':'failed',updated:'$$NOW',errorCode:{$literal:code},errorMessage:{$literal:message}}},
    {$unset:['leaseToken','leaseUntil']},
  ]);}
  async ping(){await this.client.db(this.jobs.dbName).command({ping:1});}
  async close(){await this.client.close();}
}
export function publicJob(job:Job,detail=false){const {id,name,symbol,created,updated,status,attempts,errorCode,errorMessage,verification}=job;return {id,name,symbol,created,updated,status,attempts,errorCode,errorMessage,verification,...(detail?{snapshot:JSON.parse(job.snapshot),analysis:job.result?JSON.parse(job.result):null,...(job.status==='completed'&&job.result?{confidence:researchCertificate({id:job.id,snapshot:JSON.parse(job.snapshot),analysis:JSON.parse(job.result)})}:{})}:{})};}
