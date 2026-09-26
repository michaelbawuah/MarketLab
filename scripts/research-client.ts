import { readFile,writeFile } from 'node:fs/promises';
import { signResearchRequest } from '../lib/research-signing.ts';
import { validateResearchSnapshot } from '../lib/finance/research-input.ts';
import { researchFingerprint } from '../lib/finance/research.ts';
const [command,file,output]=process.argv.slice(2),secret=process.env.RESEARCH_SERVICE_SECRET??'',owner=process.env.RESEARCH_OWNER_ID??'',origin=process.env.RESEARCH_SERVICE_URL??'http://127.0.0.1:8788';
if(command!=='submit'||!file||!output)throw new Error('Usage: pnpm service:submit submit EXPORTED_REPORT.json OUTPUT.json (set RESEARCH_OWNER_ID and RESEARCH_SERVICE_SECRET).');
const url=new URL(origin);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Use HTTPS or loopback HTTP for the service origin.');
async function call(method:string,path:string,body=''){const headers=await signResearchRequest(secret,owner,method,path,body),r=await fetch(url.origin+path,{method,headers:{...headers,'Content-Type':'application/json'},body:method==='POST'?body:undefined,redirect:'error',signal:AbortSignal.timeout(10000)});const data=await r.json() as {error?:string;job:{id:string;status:string;snapshot?:unknown;analysis?:unknown;errorMessage?:string}};if(!r.ok)throw new Error(data.error??'Service request failed.');return data.job;}
const bytes=await readFile(file);if(bytes.length>4*1024*1024)throw new Error('Export exceeds 4 MiB.');const exported=JSON.parse(bytes.toString('utf8')),snapshot=await validateResearchSnapshot(exported.snapshot??exported),fingerprint=await researchFingerprint(snapshot);
if(exported.id&&exported.id!==fingerprint)throw new Error('Report fingerprint does not match its snapshot.');
let job=await call('POST','/v1/jobs',JSON.stringify({snapshot}));const deadline=Date.now()+120000;
while(['queued','running'].includes(job.status)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,500));job=await call('GET',`/v1/jobs/${fingerprint}`);}
if(job.status!=='completed')throw new Error(job.errorMessage??`Job is ${job.status}; resubmit the same export to resume without duplication.`);
job=await call('GET',`/v1/jobs/${fingerprint}`);await writeFile(output,JSON.stringify({format:'marketlab-service-job-v1',...job},null,2)+'\n',{flag:'wx',mode:0o600});console.log(`Verified job ${job.id}; saved ${output}.`);
