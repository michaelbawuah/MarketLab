import { publicResearch, shareDigest, type SharedResearch } from './finance/shared-research.ts';
import type { SavedResearch } from './finance/research.ts';

export class ShareError extends Error { status:number; constructor(message:string,status=400){super(message);this.status=status;} }
type ShareRow={owner:string;run_id:string;token_hash:string;created:string;expires:string;revoked:string|null;revision:number;report:string;digest:string};
type RunRow={id:string;name:string;created:string;symbol:string;benchmark:string;start:string;end:string;payload:string;result:string};
export type ShareStatus={revision:number;active:boolean;created:string|null;expires:string|null};
const validId=(id:string)=>/^[a-f0-9]{64}$/.test(id);
const status=(r:ShareRow|null,now:string):ShareStatus=>({revision:r?.revision??0,active:!!r&&!r.revoked&&r.expires>now,created:r?.created??null,expires:r?.expires??null});
export async function ownedResearch(db:D1Database,owner:string,id:string):Promise<SavedResearch> {
  if(!validId(id))throw new ShareError('Experiment not found.',404);
  const r=await db.prepare('SELECT id,name,created,symbol,benchmark,start,end,payload,result FROM research_runs WHERE owner = ? AND id = ?').bind(owner,id).first<RunRow>();
  if(!r)throw new ShareError('Experiment not found.',404);
  return {id:r.id,name:r.name,created:r.created,symbol:r.symbol,benchmark:r.benchmark,start:r.start,end:r.end,snapshot:JSON.parse(r.payload),analysis:JSON.parse(r.result)};
}
export async function sharingPreview(db:D1Database,owner:string,id:string,now=new Date()) {
  const run=await ownedResearch(db,owner,id),report=publicResearch(run),body=JSON.stringify(report);
  if(new TextEncoder().encode(body).length>1800000)throw new ShareError('This report is too large to share. Save a shorter experiment.',413);
  const row=await db.prepare('SELECT revision,created,expires,revoked FROM research_shares WHERE owner = ? AND run_id = ?').bind(owner,id).first<ShareRow>();
  return {report,digest:await shareDigest(body),status:status(row,now.toISOString())};
}
export async function createShare(db:D1Database,owner:string,input:{id:string;revision:number;digest:string;days:number;confirmed:boolean},now=new Date()) {
  if(!Number.isSafeInteger(input.revision)||input.revision<0||![7,30].includes(input.days)||input.confirmed!==true||!validId(input.digest))throw new ShareError('Review the public summary and confirm sharing.');
  const preview=await sharingPreview(db,owner,input.id,now);
  if(preview.digest!==input.digest||preview.status.revision!==input.revision)throw new ShareError('The report or link changed. Reload the sharing preview.',409);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
  const hash=await shareDigest(token),created=now.toISOString(),expires=new Date(now.getTime()+input.days*86400000).toISOString();
  const statement=input.revision===0
    ?db.prepare('INSERT INTO research_shares (owner,run_id,token_hash,created,expires,revoked,revision,report,digest) VALUES (?,?,?,?,?,NULL,1,?,?) ON CONFLICT(owner,run_id) DO NOTHING').bind(owner,input.id,hash,created,expires,JSON.stringify(preview.report),preview.digest)
    :db.prepare('UPDATE research_shares SET token_hash=?,created=?,expires=?,revoked=NULL,revision=revision+1,report=?,digest=? WHERE owner=? AND run_id=? AND revision=?').bind(hash,created,expires,JSON.stringify(preview.report),preview.digest,owner,input.id,input.revision);
  if((await statement.run()).meta.changes<1)throw new ShareError('The link changed in another session. Reload the sharing preview.',409);
  return {path:`/share/${token}`,status:{revision:input.revision+1,active:true,created,expires}};
}
export async function revokeShare(db:D1Database,owner:string,id:string,revision:number,now=new Date()) {
  await ownedResearch(db,owner,id);
  if(!Number.isSafeInteger(revision)||revision<1)throw new ShareError('Reload the current link before revoking it.',409);
  const r=await db.prepare('UPDATE research_shares SET revoked=?,revision=revision+1 WHERE owner=? AND run_id=? AND revision=?').bind(now.toISOString(),owner,id,revision).run();
  if(r.meta.changes<1)throw new ShareError('The link changed in another session. Reload the sharing preview.',409);
  return {revision:revision+1,active:false,created:null,expires:null} satisfies ShareStatus;
}
export async function readShare(db:D1Database,token:string,now=new Date()) {
  if(!validId(token))return null;
  const row=await db.prepare('SELECT report,digest,created,expires FROM research_shares WHERE token_hash = ? AND revoked IS NULL AND expires > ?').bind(await shareDigest(token),now.toISOString()).first<ShareRow>();
  if(!row)return null;
  if(await shareDigest(row.report)!==row.digest)throw new ShareError('This report is temporarily unavailable.',503);
  return {report:JSON.parse(row.report) as SharedResearch,digest:row.digest,created:row.created,expires:row.expires};
}
