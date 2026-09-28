import { database,identity,json,failure,requestBody,HttpError,publicSharingEnabled } from '@/lib/server';
import { ownedResearch, ShareError } from '@/lib/research-sharing';
import { publicResearch, shareDigest, type SharedResearch } from '@/lib/finance/shared-research';
import { loadPlan } from '@/lib/planning/store';
import { priorQuarter,eligiblePeerReturn,validateCohort,starterStrategies } from '@/lib/planning/community';
type Publication={id:string;title:string;created:string;report:string;digest:string};
const titleValue=(value:unknown)=>{if(typeof value!=='string'||value.trim().length<2||value.trim().length>80||/[\u0000-\u001f\u007f]/.test(value))throw new HttpError('Use a public strategy title of 2–80 characters.');return value.trim();};
async function preview(owner:string,id:unknown,title:unknown){
 if(typeof id!=='string')throw new HttpError('Choose a saved backtest.');
 const run=await ownedResearch(database(),owner,id);if(!run.replayReceipt)throw new HttpError('Open this backtest and complete its independent calculation check before publishing.',409);
 if(run.analysis.synthetic)throw new HttpError('Publish a report using historical data. Fictional practice reports are kept out of the community library.',409);
 const report=publicResearch(run),name=titleValue(title);return {title:name,report,digest:await shareDigest(JSON.stringify({title:name,report}))};
}
async function publications(owner?:string){
 const fields=`id,title,created,
 json_extract(report,'$.symbol') AS symbol,json_extract(report,'$.benchmark') AS benchmark,
 json_extract(report,'$.settings') AS settings,json_extract(report,'$.analysis.full.strategy.returnPct') AS returnPct,
 json_extract(report,'$.analysis.full.strategy.maxDrawdown') AS drawdown,
 json_extract(report,'$.analysis.holdout.strategy.returnPct') AS holdout,
 json_extract(report,'$.certificates.full.independentReplay.verifiedAt') AS verifiedAt`;
 const db=database(),rows=owner?await db.prepare(`SELECT ${fields} FROM strategy_library WHERE owner=? ORDER BY created DESC LIMIT 30`).bind(owner).all():await db.prepare(`SELECT ${fields} FROM strategy_library ORDER BY created DESC LIMIT 60`).all();
 return rows.results.map(r=>({...r,settings:JSON.parse(r.settings as string)}));
}
async function peerView(owner:string){
 const db=database(),period=priorQuarter(),membership=await db.prepare('SELECT cohort,active FROM peer_contributions WHERE owner=? AND period=?').bind(owner,period.id).first<{cohort:string;active:number}>();
 if(!membership||!membership.active)return {period,consent:false,withdrawn:!!membership,release:null};
 const release=await db.prepare('SELECT payload FROM peer_releases WHERE period=? AND cohort=?').bind(period.id,membership.cohort).first<{payload:string}>();
 return {period,consent:true,cohort:membership.cohort,release:release?JSON.parse(release.payload):null};
}
export async function GET(request:Request){try{const url=new URL(request.url);if(url.searchParams.has('peers'))return json(await peerView(await identity()));if(!publicSharingEnabled())return json({starters:starterStrategies,publications:[],enabled:false});
 const id=url.searchParams.get('id');if(id){const r=await database().prepare('SELECT id,title,created,report,digest FROM strategy_library WHERE id=?').bind(id).first<Publication>();if(!r)throw new HttpError('This publication is no longer available.',404);const report=JSON.parse(r.report) as SharedResearch;if(await shareDigest(JSON.stringify({title:r.title,report}))!==r.digest)throw new HttpError('This publication is temporarily unavailable.',503);return json({...r,report});}
 return json({starters:starterStrategies,publications:await publications(url.searchParams.has('mine')?await identity():undefined),enabled:true});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const owner=await identity(),body=await requestBody(request,4096) as Record<string,unknown>,db=database();
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','id','title','digest','confirmed','goal','risk'].includes(k)))throw new HttpError('Choose a supported community action.');
 if(body.action==='peer-join'){
  if(body.confirmed!==true)throw new HttpError('Read and accept the optional peer-sharing terms first.');
  let cohort;try{cohort=validateCohort(body.goal,body.risk);}catch(e){throw new HttpError((e as Error).message);}
  const period=priorQuarter(),plan=await loadPlan(owner);if(!plan.portfolio)throw new HttpError('Import a historical portfolio before joining peer comparisons.');
  let value;try{value=eligiblePeerReturn(plan.portfolio.analysis,period);}catch(e){throw new HttpError((e as Error).message);}
  const inserted=await db.prepare('INSERT OR IGNORE INTO peer_contributions (owner,period,cohort,return_bps,created,active) VALUES (?,?,?,?,?,1)').bind(owner,period.id,cohort,value,new Date().toISOString()).run();
  if(!inserted.meta.changes)throw new HttpError('Your choice for this quarter is already recorded. You can withdraw it; a different group can be chosen next quarter.',409);
  // One atomic statement freezes a coarse median for a fixed cohort. No exact
  // counts, arbitrary filters, holdings, values or participant IDs are exposed.
  // A withdrawn release is never recomputed, preventing before/after queries.
  await db.prepare(`INSERT OR IGNORE INTO peer_releases (period,cohort,payload,created)
   WITH ranked AS (SELECT return_bps, ROW_NUMBER() OVER (ORDER BY return_bps) AS rank, COUNT(*) OVER () AS n
    FROM peer_contributions WHERE period=? AND cohort=? AND active=1), summary AS (
    SELECT MAX(n) AS n, AVG(CASE WHEN rank IN ((n+1)/2,(n+2)/2) THEN return_bps END) AS median FROM ranked)
   SELECT ?,?,json_object('medianReturnPct',ROUND(median/100.0),'participants',CASE WHEN n<50 THEN '20–49' WHEN n<100 THEN '50–99' ELSE '100+' END,'withdrawn',0),?
   FROM summary WHERE n>=20`).bind(period.id,cohort,period.id,cohort,new Date().toISOString()).run();
  return json(await peerView(owner));
 }
 if(body.action==='peer-withdraw'){
  await db.batch([
   db.prepare(`UPDATE peer_releases SET payload='{"withdrawn":true}' WHERE (period,cohort) IN (SELECT period,cohort FROM peer_contributions WHERE owner=? AND active=1)`).bind(owner),
   db.prepare('UPDATE peer_contributions SET active=0,return_bps=0 WHERE owner=?').bind(owner),
  ]);return json(await peerView(owner));
 }
 if(!publicSharingEnabled())throw new HttpError('Community publishing is not available right now.',403);
 if(body.action==='preview')return json(await preview(owner,body.id,body.title));
 if(body.action==='publish'){
  if(body.confirmed!==true)throw new HttpError('Review the exact public report before publishing.');
  const result=await preview(owner,body.id,body.title);if(body.digest!==result.digest)throw new HttpError('The report changed. Review the publication preview again.',409);
  const id=crypto.randomUUID(),created=new Date().toISOString();
  const r=await db.prepare('INSERT OR IGNORE INTO strategy_library (id,owner,run_id,created,title,report,digest) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM strategy_library WHERE owner=?)<30').bind(id,owner,body.id as string,created,result.title,JSON.stringify(result.report),result.digest,owner).run();
  if(!r.meta.changes)throw new HttpError('This report is already published, or you have reached 30 published strategies. Remove an existing publication before trying again.',409);
  return json({id,created,...result},201);
 }
 if(body.action==='unpublish'){
  if(typeof body.id!=='string')throw new HttpError('Choose your published strategy.');
  const r=await db.prepare('DELETE FROM strategy_library WHERE owner=? AND id=?').bind(owner,body.id).run();if(!r.meta.changes)throw new HttpError('Published strategy not found.',404);return json({removed:true});
 }
 throw new HttpError('Choose a supported community action.');
 }catch(e){if(e instanceof ShareError)return json({error:e.message},e.status);return failure(e);}}
