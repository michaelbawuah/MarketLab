import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { analyze, type Quote, type Transaction } from './finance/core';
import { DATASET, demoQuotes, demoTransactions, type Workspace, type PipelineRun } from './finance/demo';
import { workspaceOwner, WorkspaceAccessError } from './workspace-access';
export class HttpError extends Error { constructor(message:string, public status=400){super(message);} }
export function database(){if(!env.DB)throw new HttpError('Database is temporarily unavailable.',503);return env.DB;}
export function publicSharingEnabled(){return env.PUBLIC_REPORT_SHARING_ENABLED==='true';}
export async function identity(){
 const h=await headers();
 try { return workspaceOwner(h.get('oai-authenticated-user-id'),h.get('oai-authenticated-user-email'),env.WORKSPACE_OWNER_EMAIL,process.env.NODE_ENV==='development'); }
 catch(e){if(e instanceof WorkspaceAccessError)throw new HttpError(e.message,e.status);throw e;}
}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(e:unknown){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('Workspace operation failed',e);return json({error:'The saved workspace is temporarily unavailable. Please retry.'},503);}
export async function requestBody(request:Request,maxBytes=4096){
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==new URL(request.url).host)throw new HttpError('Cross-origin writes are not allowed.',403);
 if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError('Expected a JSON request.',415);
 const reader=request.body?.getReader();if(!reader)throw new HttpError('Request body is required.');
 let bytes=0,raw='';const decoder=new TextDecoder('utf-8',{fatal:true});
 try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw new HttpError('Request is too large.',413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}
 catch(e){if(e instanceof HttpError)throw e;throw new HttpError('Request must contain valid UTF-8 text.');}
 finally{reader.releaseLock();}
 try{return JSON.parse(raw) as unknown;}catch{throw new HttpError('Invalid JSON request.');}
}
export async function loadWorkspace(owner:string):Promise<Workspace>{
 const db=database();
 const result=await db.batch([
  db.prepare('SELECT payload FROM ledger WHERE owner = ? ORDER BY sequence').bind(owner),
  db.prepare('SELECT symbol, date, close FROM prices WHERE dataset = ? ORDER BY date, symbol').bind(DATASET),
  db.prepare('SELECT id, started, status, records, inserted, duration, message FROM runs WHERE owner = ? ORDER BY started DESC LIMIT 15').bind(owner),
 ]);
 const extra=(result[0].results as {payload:string}[]).map(row=>JSON.parse(row.payload) as Transaction);
 const stored=result[1].results as unknown as Quote[];
 const expected=demoQuotes();
 // Before the first ingestion, a deterministic, explicitly labeled preview is used.
 // A partial persisted dataset is rejected, never silently filled with future prices.
 if(stored.length>0&&stored.length!==expected.length)throw new HttpError('Price dataset is incomplete. Run ingestion again to repair it.',409);
 const quotes=stored.length?stored:expected;
 const transactions=[...demoTransactions(),...extra].sort((a,b)=>a.date.localeCompare(b.date));
 return {analytics:analyze(transactions,quotes),transactions,quotes,version:extra.length,pipeline:{stored:stored.length,expected:expected.length,runs:result[2].results as unknown as PipelineRun[]}};
}
