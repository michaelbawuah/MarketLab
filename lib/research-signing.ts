export const RESEARCH_AUDIENCE='marketlab-research-v1';
export function signingText(method:string,target:string,timestamp:string,nonce:string,owner:string,bodyHash:string){return ['v1',RESEARCH_AUDIENCE,method,target,timestamp,nonce,owner,bodyHash].join('\n');}
export function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export async function signResearchRequest(secret:string,owner:string,method:string,target:string,body='') {
  if(secret.length<32||!/^\S+$/.test(secret)||!/^[A-Za-z0-9:_@.\-]{1,128}$/.test(owner))throw new Error('Invalid service authentication configuration.');
  const timestamp=Math.floor(Date.now()/1000).toString(),nonce=hex(crypto.getRandomValues(new Uint8Array(16)).buffer),encoder=new TextEncoder(),bodyHash=hex(await crypto.subtle.digest('SHA-256',encoder.encode(body)));
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=hex(await crypto.subtle.sign('HMAC',key,encoder.encode(signingText(method,target,timestamp,nonce,owner,bodyHash))));
  return {'x-marketlab-owner':owner,'x-marketlab-timestamp':timestamp,'x-marketlab-nonce':nonce,'x-marketlab-signature':signature};
}
