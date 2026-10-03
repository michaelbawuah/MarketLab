import { researchCertificate } from '../../lib/finance/confidence.ts';
import { MongoClient, MongoServerError, type Collection } from 'mongodb';
import { randomUUID } from 'node:crypto';
import type { ResearchSnapshot, ResearchAnalysis } from '../../lib/finance/research.ts';
import { researchFingerprint } from '../../lib/finance/research.ts';

export type Verification={engine:string;comparisons:number;maxAbsoluteError:number};
export type Job={owner:string;id:string;slot:number;name:string;symbol:string;created:Date;updated:Date;status:'queued'|'running'|'completed'|'failed';attempts:number;snapshot:string;result?:string;verification?:Verification;leaseToken?:string;leaseUntil?:Date;errorCode?:string;errorMessage?:string;globalSlot?:number;activeSlot?:number;admittedAt?:Date;firstClaimedAt?:Date;attemptStartedAt?:Date;completedAt?:Date};
export class ServiceError extends Error {status:number;code?:string;retryAfter?:number;constructor(message:string,status=400,code?:string,retryAfter?:number){super(message);this.status=status;this.code=code;this.retryAfter=retryAfter;}}
export type AdmissionLimits={global:number;perOwner:number};
export const DEFAULT_ADMISSION:AdmissionLimits={global:64,perOwner:4};
export function admissionLimits(value:AdmissionLimits=DEFAULT_ADMISSION){
  if(!Number.isSafeInteger(value.global)||value.global<1||value.global>256||!Number.isSafeInteger(value.perOwner)||value.perOwner<1||value.perOwner>30||value.perOwner>value.global)throw new Error('Invalid research admission limits.');
  return {...value};
}
const active={status:{$in:['queued','running'] as Job['status'][]}};
const legacyValidator={$jsonSchema:{bsonType:'object',required:['owner','id','slot','status','snapshot','attempts'],properties:{owner:{bsonType:'string',minLength:1,maxLength:128},id:{bsonType:'string',pattern:'^[a-f0-9]{64}$'},slot:{bsonType:'int',minimum:0,maximum:29},status:{enum:['queued','running','completed','failed']},snapshot:{bsonType:'string'},attempts:{bsonType:'int',minimum:0,maximum:3}}}};
const duplicate=(e:unknown)=>e instanceof MongoServerError&&e.code===11000;
export class JobStore {
  client:MongoClient;jobs:Collection<Job>;nonces:Collection<{owner:string;nonce:string;expires:Date}>;
  limits:AdmissionLimits;
  constructor(uri:string,name:string,acceptancePrefix='',limits:AdmissionLimits=DEFAULT_ADMISSION){
    // Operator-only acceptance checks may use isolated collections with the
    // existing database role. HTTP callers never control this prefix.
    if(acceptancePrefix&&!/^acceptance_[a-f0-9]{32}_$/.test(acceptancePrefix))throw new Error('Invalid acceptance collection prefix.');
    this.limits=admissionLimits(limits);
    this.client=new MongoClient(uri,{timeoutMS:5000,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,maxPoolSize:10,writeConcern:{w:'majority'}});const db=this.client.db(name);this.jobs=db.collection<Job>(acceptancePrefix+'research_jobs');this.nonces=db.collection(acceptancePrefix+'request_nonces');
  }
  async initialize(operatorUri?:string){
    await this.client.connect();const db=this.jobs.dbName;
    const validator={$jsonSchema:{...legacyValidator.$jsonSchema,properties:{...legacyValidator.$jsonSchema.properties,globalSlot:{bsonType:'int',minimum:0,maximum:this.limits.global-1},activeSlot:{bsonType:'int',minimum:0,maximum:this.limits.perOwner-1},admittedAt:{bsonType:'date'}},oneOf:[{properties:{status:{enum:['queued','running']}},required:['globalSlot','activeSlot','admittedAt']},{properties:{status:{enum:['completed','failed']}}}]}};
    try{await this.client.db(db).createCollection(this.jobs.collectionName,{validator});}catch(e){if(!(e instanceof MongoServerError&&e.code===48))throw e;}
    await this.initializeAdmission(validator,operatorUri);
    await this.jobs.createIndex({owner:1,id:1},{unique:true});await this.jobs.createIndex({owner:1,slot:1},{unique:true});await this.jobs.createIndex({status:1,leaseUntil:1,created:1});
    await this.nonces.createIndex({owner:1,nonce:1},{unique:true});await this.nonces.createIndex({expires:1},{expireAfterSeconds:0});
  }
  private async initializeAdmission(validator:Record<string,unknown>,operatorUri?:string){
    const db=this.client.db(this.jobs.dbName);
    const existing=await db.listCollections({name:this.jobs.collectionName},{nameOnly:false}).next();
    const options=existing&&'options' in existing?existing.options:undefined,current=options?.validator;
    if((options?.validationLevel??'strict')!=='strict'||(options?.validationAction??'error')!=='error')throw new Error('Research jobs require strict, rejecting database validation.');
    const legacy=JSON.stringify(current)===JSON.stringify(legacyValidator);
    if(!legacy&&JSON.stringify(current)!==JSON.stringify(validator))throw new Error('Research admission limits differ from the persisted schema; an explicit migration is required.');
    const fits=(rows:Job[])=>rows.length<=this.limits.global&&Object.values(rows.reduce<Record<string,number>>((counts,row)=>{counts[row.owner]=(counts[row.owner]??0)+1;return counts;},Object.create(null))).every(n=>n<=this.limits.perOwner);
    if(!fits(await this.jobs.find(active,{projection:{owner:1}}).limit(this.limits.global+1).toArray()))throw new Error('Drain unfinished research jobs before applying these admission limits.');
    if(legacy){
      if(!operatorUri)throw new Error('An operator must migrate the research admission schema before startup.');
      // One-time schema privilege stays out of the ordinary readWrite service.
      const operator=new MongoClient(operatorUri,{timeoutMS:5000});
      try{await operator.db(db.databaseName).command({collMod:this.jobs.collectionName,validator,validationLevel:'strict',validationAction:'error'});}finally{await operator.close();}
    }
    // The strict validator is an old-writer barrier. Presence filters let these
    // indexes be built before repairing legacy rows. New writes must have slots.
    await this.jobs.createIndex({globalSlot:1},{unique:true,name:'active_global_slot',partialFilterExpression:{...active,globalSlot:{$exists:true}}});
    await this.jobs.createIndex({owner:1,activeSlot:1},{unique:true,name:'active_owner_slot',partialFilterExpression:{...active,activeSlot:{$exists:true}}});
    if(!fits(await this.jobs.find(active,{projection:{owner:1}}).limit(this.limits.global+1).toArray()))throw new Error('Research jobs arrived before the migration barrier; drain them before retrying.');
    // Repair is monotonic and guarded by the same indexes as admission. Two
    // initializers, or a restart after interruption, can safely repair together.
    const rows=await this.jobs.find(active,{projection:{owner:1,id:1}}).sort({created:1,id:1}).limit(this.limits.global+1).toArray();
    for(const row of rows){
      for(let attempt=0;attempt<this.limits.global+this.limits.perOwner;attempt++){
        const current=await this.get(row.owner,row.id);
        if(!current||!['queued','running'].includes(current.status)||(current.globalSlot!==undefined&&current.activeSlot!==undefined&&current.admittedAt))break;
        const occupied=await this.jobs.find(active,{projection:{owner:1,globalSlot:1,activeSlot:1}}).toArray();
        const globals=new Set(occupied.map(j=>j.globalSlot)),owners=new Set(occupied.filter(j=>j.owner===row.owner).map(j=>j.activeSlot));
        const globalSlot=current.globalSlot??Array.from({length:this.limits.global},(_,i)=>i).find(i=>!globals.has(i)),activeSlot=current.activeSlot??Array.from({length:this.limits.perOwner},(_,i)=>i).find(i=>!owners.has(i));
        // Another initializer may have repaired this row after our read.
        if(globalSlot===undefined||activeSlot===undefined)continue;
        try{await this.jobs.updateOne({owner:row.owner,id:row.id,...active,$or:[{globalSlot:{$exists:false}},{activeSlot:{$exists:false}},{admittedAt:{$exists:false}}]},[{$set:{globalSlot,activeSlot,admittedAt:{$ifNull:['$admittedAt','$$NOW']}}}]);}catch(e){if(!duplicate(e))throw e;}
      }
    }
    if(await this.jobs.countDocuments({...active,$or:[{globalSlot:{$exists:false}},{activeSlot:{$exists:false}},{admittedAt:{$exists:false}}]}))throw new Error('Research admission migration did not finish; retry startup.');
    const final=await db.listCollections({name:this.jobs.collectionName},{nameOnly:false}).next();
    if(!final||!('options' in final)||JSON.stringify(final.options?.validator)!==JSON.stringify(validator)||(final.options?.validationLevel??'strict')!=='strict'||(final.options?.validationAction??'error')!=='error')throw new Error('Research admission schema changed during startup.');
  }
  async consumeNonce(owner:string,nonce:string){try{await this.nonces.insertOne({owner,nonce,expires:new Date(Date.now()+180000)});}catch(e){if(duplicate(e))throw new ServiceError('Request signature has already been used.',409);throw e;}}
  async submit(owner:string,snapshot:ResearchSnapshot){
    const id=await researchFingerprint(snapshot),existing=await this.jobs.findOne({owner,id});if(existing)return existing;
    const payload=JSON.stringify(snapshot);if(Buffer.byteLength(payload)>1024*1024)throw new ServiceError('Snapshot exceeds 1 MiB.',413);
    // Occupancy reads only select candidates. Unique indexes and strict schema
    // enforce all three bounds atomically on the job document itself.
    for(let attempt=0;attempt<this.limits.global+this.limits.perOwner+30;attempt++){
      const [owned,occupied]=await Promise.all([this.jobs.find({owner},{projection:{id:1,slot:1,status:1,activeSlot:1}}).toArray(),this.jobs.find(active,{projection:{globalSlot:1}}).toArray()]);
      const lifetime=new Set(owned.map(j=>j.slot)),ownerSlots=new Set(owned.filter(j=>['queued','running'].includes(j.status)).map(j=>j.activeSlot)),globalSlots=new Set(occupied.map(j=>j.globalSlot));
      const slot=Array.from({length:30},(_,i)=>i).find(i=>!lifetime.has(i)),activeSlot=Array.from({length:this.limits.perOwner},(_,i)=>i).find(i=>!ownerSlots.has(i)),offset=parseInt(id.slice(0,8),16)%this.limits.global,globalSlot=Array.from({length:this.limits.global},(_,i)=>(i+offset)%this.limits.global).find(i=>!globalSlots.has(i));
      if(slot===undefined||activeSlot===undefined||globalSlot===undefined){
        const replay=await this.jobs.findOne({owner,id});if(replay)return replay;
        if(slot===undefined)throw new ServiceError('This workspace has reached its 30 saved background-report limit.',409);
        if(activeSlot===undefined)throw new ServiceError('Several of your reports are still being calculated. Wait for one to finish, then try again.',429,'owner_capacity',2);
        throw new ServiceError('Report calculations are busy. Please try again shortly.',503,'global_capacity',2);
      }
      const now=new Date(),job:Job={owner,id,slot,globalSlot,activeSlot,name:snapshot.config.name,symbol:snapshot.asset.dataset.symbol,created:now,updated:now,status:'queued',attempts:0,snapshot:payload};
      try{
        // Upsert supplies database-clock timestamps and preserves an existing
        // matching fingerprint unchanged, even if another submit won the race.
        const saved=await this.jobs.findOneAndUpdate({owner,id},[{$replaceWith:{$cond:[{$eq:[{$type:'$slot'},'missing']},{$mergeObjects:[{$literal:job},{created:'$$NOW',updated:'$$NOW',admittedAt:'$$NOW'}]},'$$ROOT']}}],{upsert:true,returnDocument:'after'});
        if(saved)return saved;
      }catch(e){if(!duplicate(e))throw e;const replay=await this.jobs.findOne({owner,id});if(replay)return replay;}
    }
    const replay=await this.jobs.findOne({owner,id});if(replay)return replay;
    throw new ServiceError('Report calculations are busy. Please try again shortly.',503,'global_capacity',2);
  }
  async get(owner:string,id:string){return this.jobs.findOne({owner,id});}
  async list(owner:string){return this.jobs.find({owner},{projection:{snapshot:0,result:0,leaseToken:0,globalSlot:0,activeSlot:0,owner:0,_id:0}}).sort({created:-1,id:1}).toArray();}
  async claim(leaseMs:number){
    // Every ownership decision uses the database clock. Client clocks may disagree.
    const expired={$expr:{$lte:['$leaseUntil','$$NOW']}};
    await this.jobs.updateMany({status:'running',...expired,attempts:{$gte:3}},[
      {$set:{status:'failed',updated:'$$NOW',completedAt:'$$NOW',errorCode:'attempts_exhausted',errorMessage:'Worker attempts exhausted.'}},
      {$unset:['leaseToken','leaseUntil','globalSlot','activeSlot']},
    ]);
    return this.jobs.findOneAndUpdate({attempts:{$lt:3},$or:[{status:'queued'},{status:'running',...expired}]},[
      {$set:{status:'running',updated:'$$NOW',firstClaimedAt:{$ifNull:['$firstClaimedAt','$$NOW']},attemptStartedAt:'$$NOW',leaseToken:randomUUID(),leaseUntil:{$add:['$$NOW',leaseMs]},attempts:{$add:['$attempts',1]}}},
      {$unset:['errorCode','errorMessage']},
    ],{sort:{created:1},returnDocument:'after'});
  }
  private fence(job:Job){return {owner:job.owner,id:job.id,status:'running' as const,leaseToken:job.leaseToken,$expr:{$gt:['$leaseUntil','$$NOW']}};}
  async heartbeat(job:Job,leaseMs:number){const r=await this.jobs.updateOne(this.fence(job),[{$set:{leaseUntil:{$add:['$$NOW',leaseMs]},updated:'$$NOW'}}]);return r.matchedCount===1;}
  async complete(job:Job,analysis:ResearchAnalysis,verification:Verification){
    const result=JSON.stringify(analysis);if(Buffer.byteLength(job.snapshot)+Buffer.byteLength(result)>1900000)throw new ServiceError('Combined research inputs and results exceed the saved-run size limit.');
    const r=await this.jobs.updateOne(this.fence(job),[
      {$set:{status:'completed',updated:'$$NOW',completedAt:'$$NOW',result:{$literal:result},verification:{$literal:verification}}},
      {$unset:['leaseToken','leaseUntil','errorCode','errorMessage','globalSlot','activeSlot']},
    ]);return r.modifiedCount===1;
  }
  async fail(job:Job,code:string,message:string,retry:boolean){const requeue=retry&&job.attempts<3;await this.jobs.updateOne(this.fence(job),[
    {$set:{status:requeue?'queued':'failed',updated:'$$NOW',...(!requeue?{completedAt:'$$NOW'}:{}),errorCode:{$literal:code},errorMessage:{$literal:message}}},
    {$unset:['leaseToken','leaseUntil',...(!requeue?['globalSlot','activeSlot']:[])]},
  ]);}
  async ping(){await this.client.db(this.jobs.dbName).command({ping:1});}
  async close(){await this.client.close();}
}
export function publicJob(job:Job,detail=false){const {id,name,symbol,created,updated,status,attempts,errorCode,errorMessage,verification,admittedAt,firstClaimedAt,attemptStartedAt,completedAt}=job;return {id,name,symbol,created,updated,status,attempts,errorCode,errorMessage,verification,timing:{admittedAt,firstClaimedAt,attemptStartedAt,completedAt},...(detail?{snapshot:JSON.parse(job.snapshot),analysis:job.result?JSON.parse(job.result):null,...(job.status==='completed'&&job.result?{confidence:researchCertificate({id:job.id,snapshot:JSON.parse(job.snapshot),analysis:JSON.parse(job.result)})}:{})}:{})};}
