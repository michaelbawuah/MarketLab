import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { signingText } from '../../lib/research-signing.ts';
import { ServiceError, type JobStore } from './store.ts';
export async function authenticate(secret:string,headers:IncomingHttpHeaders,method:string,target:string,body:Buffer,store:JobStore) {
  const owner=headers['x-marketlab-owner'],timestamp=headers['x-marketlab-timestamp'],nonce=headers['x-marketlab-nonce'],signature=headers['x-marketlab-signature'];
  if(typeof owner!=='string'||!/^[A-Za-z0-9:_@.\-]{1,128}$/.test(owner)||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||Math.abs(Date.now()/1000-Number(timestamp))>60)throw new ServiceError('Invalid or expired service signature.',401);
  const hash=createHash('sha256').update(body).digest('hex'),expected=createHmac('sha256',secret).update(signingText(method,target,timestamp,nonce,owner,hash)).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new ServiceError('Invalid or expired service signature.',401);
  await store.consumeNonce(owner,nonce);return owner;
}
