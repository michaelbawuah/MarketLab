import { env } from 'cloudflare:workers';
import { HttpError } from './server';
import { signResearchRequest } from './research-signing';

export function researchConnection(){
  if(!env.RESEARCH_SERVICE_URL&&!env.RESEARCH_SERVICE_SECRET)return null;
  if(!env.RESEARCH_SERVICE_URL||!env.RESEARCH_SERVICE_SECRET||env.RESEARCH_SERVICE_SECRET.length<32)throw new HttpError('Research service is not configured completely.',503);
  let url:URL;try{url=new URL(env.RESEARCH_SERVICE_URL);}catch{throw new HttpError('Research service configuration is invalid.',503);}
  const local=process.env.NODE_ENV==='development'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname);
  if((url.protocol!=='https:'&&!local)||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new HttpError('Research service requires an HTTPS origin.',503);
  return {url:url.origin,secret:env.RESEARCH_SERVICE_SECRET};
}
export async function researchRequest(config:NonNullable<ReturnType<typeof researchConnection>>,owner:string,method:string,path:string,body=''){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const headers=await signResearchRequest(config.secret,owner,method,path,body),response=await fetch(config.url+path,{method,headers:{...headers,'Content-Type':'application/json'},body:method==='POST'?body:undefined,signal:controller.signal,redirect:'manual'});
    if(response.status===404&&method==='GET'){await response.body?.cancel();return {job:null};}
    const reader=response.body?.getReader();if(!reader)throw new Error();let raw='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
    try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>16384){await reader.cancel();throw new Error();}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
    if(!response.ok){
      const messages:Record<number,string>={409:'This workspace has reached its 30 saved background-report limit.',422:'Independent replay did not match the saved report. No receipt was attached.',429:path==='/v1/replay'?'Independent replay is busy. Please retry shortly.':'Several of your reports are still being calculated. Wait for one to finish, then try again.'};
      if(response.status===503&&path==='/v1/jobs')throw new HttpError('Report calculations are busy. Please try again shortly. Your saved experiment remains available.',503);
      throw new HttpError(messages[response.status]??'Research service is temporarily unavailable.',messages[response.status]?response.status:503);
    }
    return JSON.parse(raw);
  }catch(e){if(e instanceof HttpError)throw e;throw new HttpError('Research service could not be reached. Your saved experiment remains available.',503);}finally{clearTimeout(timeout);}
}
