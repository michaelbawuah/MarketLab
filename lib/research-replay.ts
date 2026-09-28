import type { SavedResearch } from './finance/research.ts';
import { checkedReplayReceipt, replayReportJSON, replayDigest, type ReplayReceipt } from './finance/replay-receipt.ts';

export async function attachReplayReceipt(db:D1Database,owner:string,run:SavedResearch):Promise<SavedResearch> {
  const row=await db.prepare('SELECT receipt FROM research_replay_receipts WHERE owner=? AND run_id=?').bind(owner,run.id).first<{receipt:string}>();
  // Always strip any embedded/client-supplied receipt before the trusted lookup.
  const {replayReceipt:_discard,...report}=run;
  void _discard;
  if(!row)return report;
  let value;try{value=JSON.parse(row.receipt);}catch{return report;}
  const receipt=checkedReplayReceipt(value,run.id,await replayDigest(replayReportJSON(run)));
  return receipt?{...report,replayReceipt:receipt}:report;
}
export async function saveReplayReceipt(db:D1Database,owner:string,run:SavedResearch,value:unknown):Promise<ReplayReceipt|null> {
  const receipt=checkedReplayReceipt(value,run.id,await replayDigest(replayReportJSON(run)));
  if(!receipt)return null;
  // Fence the write against exactly the row sent to Python, including results.
  // Only successful, currently bound receipts may replace an earlier receipt.
  await db.prepare(`INSERT INTO research_replay_receipts (owner,run_id,receipt)
    SELECT owner,id,? FROM research_runs WHERE owner=? AND id=? AND payload=? AND result=?
    ON CONFLICT(owner,run_id) DO UPDATE SET receipt=excluded.receipt`)
    .bind(JSON.stringify(receipt),owner,run.id,JSON.stringify(run.snapshot),JSON.stringify(run.analysis)).run();
  // Re-read the current report to detect deletion/change during computation.
  const row=await db.prepare('SELECT payload,result FROM research_runs WHERE owner=? AND id=?').bind(owner,run.id).first<{payload:string;result:string}>();
  if(!row||row.payload!==JSON.stringify(run.snapshot)||row.result!==JSON.stringify(run.analysis))return null;
  return (await attachReplayReceipt(db,owner,run)).replayReceipt??null;
}
