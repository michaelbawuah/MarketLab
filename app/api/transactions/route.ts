import { account } from '@/lib/finance/core';
import { normalizeTransaction } from '@/lib/finance/validation';
import { identity,database,loadWorkspace,json,failure,HttpError,requestBody } from '@/lib/server';
export async function POST(request:Request){
 try {
  const owner=await identity(),body=await requestBody(request);
  let normalized;try{normalized=normalizeTransaction(body);}catch(e){throw new HttpError((e as Error).message);}
  const {transaction,version}=normalized,db=database();
  const payload=JSON.stringify(transaction);
  const existing=await db.prepare('SELECT payload FROM ledger WHERE owner = ? AND id = ?').bind(owner,transaction.id).first<{payload:string}>();
  if(existing){if(existing.payload!==payload)throw new HttpError('This request ID was already used for another transaction.',409);return json({saved:true,id:transaction.id,replayed:true});}
  const current=await loadWorkspace(owner);
  if(current.version!==version)throw new HttpError('The portfolio changed. Reload the page and try again.',409);
  if(current.version>=500)throw new HttpError('This research release supports up to 500 manual transactions.');
  try{account([...current.transactions,transaction].sort((a,b)=>a.date.localeCompare(b.date)));}catch(e){throw new HttpError((e as Error).message);}
  // Atomic compare-and-insert prevents concurrently validated writes from overdrawing cash.
  const saved=await db.prepare('INSERT INTO ledger (owner, id, sequence, payload) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM ledger WHERE owner = ?) = ?').bind(owner,transaction.id,version,payload,owner,version).run();
  if(!saved.meta.changes)throw new HttpError('The portfolio changed. Reload the page and try again.',409);
  return json({saved:true,id:transaction.id},201);
 }catch(e){return failure(e);}
}
