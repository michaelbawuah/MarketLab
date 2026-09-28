import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { JobStore,ServiceError,publicJob } from './store.ts';
import { authenticate } from './auth.ts';
import { validateResearchSnapshot } from '../../lib/finance/research-input.ts';
import { ComputePool } from './pool.ts';
import { JobRunner } from './runner.ts';
import { loadNative } from './native.ts';
import { PythonReplay } from './python-replay.ts';
import { REPLAY_MAX_BYTES, REPLAY_VERSION } from '../../lib/finance/replay-receipt.ts';
export type ServiceConfig={uri:string;database:string;secret:string;host:string;port:number;workers:number;mode:'typescript'|'cpp-verify'};
export function configFromEnv():ServiceConfig {
  const uri=process.env.MONGODB_URI??'',database=process.env.MONGODB_DATABASE??'marketlab',secret=process.env.RESEARCH_SERVICE_SECRET??'',host=process.env.RESEARCH_HOST??'127.0.0.1',port=Number(process.env.RESEARCH_PORT??process.env.PORT??8788),workers=Number(process.env.RESEARCH_WORKERS??2),mode=process.env.RESEARCH_ENGINE??'cpp-verify';
  if(!/^mongodb(\+srv)?:\/\//.test(uri)||!/^[a-zA-Z0-9_-]{1,60}$/.test(database)||secret.length<32||!/^\S+$/.test(secret)||!Number.isSafeInteger(port)||port<1||port>65535||!Number.isSafeInteger(workers)||workers<1||workers>8||!['typescript','cpp-verify'].includes(mode))throw new Error('Invalid service configuration. Set MongoDB URI and a random service secret of at least 32 characters.');
  return {uri,database,secret,host,port,workers,mode:mode as ServiceConfig['mode']};
}
async function body(request:IncomingMessage,max=1024*1024+4096){const chunks:Buffer[]=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>max)throw new ServiceError('Request exceeds the input limit.',413);chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
function send(response:ServerResponse,status:number,value:unknown){response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));}
export async function createResearchService(config:ServiceConfig){
  if(config.mode==='cpp-verify')loadNative();
  const store=new JobStore(config.uri,config.database);try{await store.initialize();}catch(e){await store.close();throw e;}
  const pool=new ComputePool(config.workers,config.mode),runner=new JobRunner(store,pool),python=new PythonReplay();
  const server=createServer({maxHeaderSize:8192,requestTimeout:15000,headersTimeout:10000},async(request,response)=>{
    try{
      const method=request.method??'',target=request.url??'';
      if(method==='GET'&&target==='/healthz'){await store.ping();send(response,200,{status:'ready',service:'marketlab-research',engine:config.mode,pythonReplay:REPLAY_VERSION});return;}
      if(!['GET','POST'].includes(method)||target.length>256)throw new ServiceError('Unsupported request.',405);
      if(method==='POST'&&!request.headers['content-type']?.startsWith('application/json'))throw new ServiceError('Expected JSON.',415);
      const raw=await body(request,target==='/v1/replay'?REPLAY_MAX_BYTES:undefined),owner=await authenticate(config.secret,request.headers,method,target,raw,store);
      if(method==='POST'&&target==='/v1/replay'){send(response,200,{receipt:await python.verify(raw)});return;}
      if(method==='POST'&&target==='/v1/jobs'){
        let snapshot;try{const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));if(!input||typeof input!=='object'||Object.keys(input).join(',')!=='snapshot')throw new Error('Expected one snapshot field.');snapshot=await validateResearchSnapshot(input.snapshot);}catch(e){throw new ServiceError((e as Error).message);}
        const job=await store.submit(owner,snapshot);send(response,job.status==='completed'?200:202,{job:publicJob(job)});void runner.tick();return;
      }
      if(method==='GET'&&target==='/v1/jobs'){send(response,200,{jobs:await store.list(owner),limit:30});return;}
      const match=/^\/v1\/jobs\/([a-f0-9]{64})(\/status)?$/.exec(target);
      if(method==='GET'&&match){const job=await store.get(owner,match[1]);if(!job)throw new ServiceError('Research job not found.',404);send(response,200,{job:publicJob(job,!match[2])});return;}
      throw new ServiceError('Endpoint not found.',404);
    }catch(e){if(e instanceof ServiceError)send(response,e.status,{error:e.message});else{console.error('research_request_unavailable');send(response,503,{error:'Research service is temporarily unavailable.'});}}
  });
  server.keepAliveTimeout=5000;server.maxRequestsPerSocket=100;runner.start();
  return {server,store,runner,async close(){await new Promise<void>(resolve=>server.close(()=>resolve()));await runner.close();await store.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const config=configFromEnv(),service=await createResearchService(config);service.server.listen(config.port,config.host,()=>console.log(`Research service listening on ${config.host}:${config.port} (${config.mode}).`));let stopping=false;const stop=()=>{if(stopping)return;stopping=true;void service.close().then(()=>process.exit(0));};process.on('SIGTERM',stop);process.on('SIGINT',stop);}
  catch{console.error('Research service startup failed. Check configuration, MongoDB availability and native build.');process.exitCode=1;}
}
