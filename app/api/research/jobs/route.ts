import { env } from 'cloudflare:workers';
import { database,identity,json,failure,HttpError,requestBody } from '@/lib/server';
import { signResearchRequest } from '@/lib/research-signing';

function connection(){
  if(!env.RESEARCH_SERVICE_URL&&!env.RESEARCH_SERVICE_SECRET)return null;
  if(!env.RESEARCH_SERVICE_URL||!env.RESEARCH_SERVICE_SECRET||env.RESEARCH_SERVICE_SECRET.length<32)throw new HttpError('Background research is not configured completely.',503);
  let url:URL;try{url=new URL(env.RESEARCH_SERVICE_URL);}catch{throw new HttpError('Background research configuration is invalid.',503);}
  const local=process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
  if((url.protocol!=='https:'&&!local)||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new HttpError('Background research requires an HTTPS service origin.',503);
  return {url:url.origin,secret:env.RESEARCH_SERVICE_SECRET};
}
async function owned(owner:string,id:unknown){if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw new HttpError('Choose a saved experiment.');const row=await database().prepare('SELECT payload FROM research_runs WHERE owner = ? AND id = ?').bind(owner,id).first<{payload:string}>();if(!row)throw new HttpError('Saved experiment not found.',404);return row;}
async function remote(config:NonNullable<ReturnType<typeof connection>>,owner:string,method:string,path:string,body=''){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const headers=await signResearchRequest(config.secret,owner,method,path,body),response=await fetch(config.url+path,{method,headers:{...headers,'Content-Type':'application/json'},body:method==='POST'?body:undefined,signal:controller.signal,redirect:'manual'});
    if(response.status===404&&method==='GET')return {job:null};
    const reader=response.body?.getReader();if(!reader)throw new Error();let raw='',size=0;const decoder=new TextDecoder();
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16384){await reader.cancel();throw new Error();}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();
    const data=JSON.parse(raw);if(!response.ok)throw new HttpError(response.status===409?'The background workspace has reached its job limit.':'Background research is temporarily unavailable.',response.status===409?409:503);return data;
  }catch(e){if(e instanceof HttpError)throw e;throw new HttpError('Background research could not be reached. Your saved experiment remains available.',503);}finally{clearTimeout(timeout);}
}
export async function GET(request:Request){try{const owner=await identity(),config=connection();if(!config)return json({available:false,job:null});const id=new URL(request.url).searchParams.get('id');await owned(owner,id);return json({available:true,...await remote(config,owner,'GET',`/v1/jobs/${id}/status`)});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const owner=await identity(),config=connection();if(!config)throw new HttpError('Background research is not enabled.',503);const body=await requestBody(request) as {id?:unknown};if(!body||Object.keys(body).join(',')!=='id')throw new HttpError('Expected a saved experiment ID.');const row=await owned(owner,body.id);return json({available:true,...await remote(config,owner,'POST','/v1/jobs',JSON.stringify({snapshot:JSON.parse(row.payload)}))});}catch(e){return failure(e);}}
