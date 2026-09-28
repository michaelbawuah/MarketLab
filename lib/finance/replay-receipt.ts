import type { ResearchSnapshot, ResearchAnalysis } from './research.ts';

export const REPLAY_VERSION = 'marketlab-python-replay-v1';
export const REPLAY_MAX_BYTES = 1_950_000;
export type ReplayReport = {id:string;snapshot:ResearchSnapshot;analysis:ResearchAnalysis};
export type ReplayReceipt = {
  format:'marketlab-replay-receipt-v1';verified:true;reportId:string;reportDigest:string;
  verifiedAt:string;verifierVersion:typeof REPLAY_VERSION;verifierSha256:string;
  segments:3;simulations:9;comparedFields:number;exactAccounting:true;
  floatAbsoluteTolerance:1e-10;floatRelativeTolerance:1e-10;
};
// Preserve the frozen snapshot's key order: it is part of the existing input ID.
// Exclude display metadata and any prior receipt; bind ALL saved inputs/results.
export function replayReportJSON(run:ReplayReport) {
  return JSON.stringify({format:'marketlab-research-v1',id:run.id,snapshot:run.snapshot,analysis:run.analysis});
}
export async function replayDigest(raw:string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),b=>b.toString(16).padStart(2,'0')).join('');
}
const fields=['format','verified','reportId','reportDigest','verifiedAt','verifierVersion','verifierSha256','segments','simulations','comparedFields','exactAccounting','floatAbsoluteTolerance','floatRelativeTolerance'].sort().join(',');
/** Validation of shape and binding, not a signature or proof of provenance.
 * Only accept receipts from the configured service or the server-owned table. */
export function checkedReplayReceipt(value:unknown,id:string,digest:string,now=Date.now()):ReplayReceipt|null {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==fields)return null;
  const r=value as ReplayReceipt;
  if(r.format!=='marketlab-replay-receipt-v1'||r.verified!==true||r.reportId!==id||r.reportDigest!==digest||!/^[a-f0-9]{64}$/.test(r.reportId)||!/^[a-f0-9]{64}$/.test(r.reportDigest)||r.verifierVersion!==REPLAY_VERSION||typeof r.verifierSha256!=='string'||!/^[a-f0-9]{64}$/.test(r.verifierSha256))return null;
  if(typeof r.verifiedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.verifiedAt)||!Number.isFinite(Date.parse(r.verifiedAt))||new Date(r.verifiedAt).toISOString()!==r.verifiedAt||Date.parse(r.verifiedAt)>now+300000)return null;
  if(r.segments!==3||r.simulations!==9||!Number.isSafeInteger(r.comparedFields)||r.comparedFields<1||r.comparedFields>1_000_000||r.exactAccounting!==true||r.floatAbsoluteTolerance!==1e-10||r.floatRelativeTolerance!==1e-10)return null;
  return r;
}
