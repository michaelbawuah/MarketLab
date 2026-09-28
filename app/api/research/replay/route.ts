import { database,identity,json,failure,HttpError,requestBody } from '@/lib/server';
import { researchConnection,researchRequest } from '@/lib/research-service';
import { ownedResearch,ShareError } from '@/lib/research-sharing';
import { saveReplayReceipt } from '@/lib/research-replay';
import { replayReportJSON,REPLAY_MAX_BYTES } from '@/lib/finance/replay-receipt';

export async function POST(request:Request){
  try {
    const owner=await identity(),body=await requestBody(request) as {id?:unknown};
    if(!body||typeof body!=='object'||Object.keys(body).join(',')!=='id'||typeof body.id!=='string')throw new HttpError('Expected a saved experiment ID.');
    const run=await ownedResearch(database(),owner,body.id);
    if(run.replayReceipt)return json({receipt:run.replayReceipt,cached:true});
    const config=researchConnection();if(!config)throw new HttpError('Independent replay is not enabled.',503);
    const raw=replayReportJSON(run);if(new TextEncoder().encode(raw).length>REPLAY_MAX_BYTES)throw new HttpError('This report exceeds the replay limit.',413);
    const result=await researchRequest(config,owner,'POST','/v1/replay',raw);
    const receipt=await saveReplayReceipt(database(),owner,run,result?.receipt);
    if(!receipt)throw new HttpError('The replay receipt could not be matched to this saved report. No verification was attached.',503);
    return json({receipt,cached:false});
  }catch(e){return failure(e instanceof ShareError?new HttpError(e.message,e.status):e);}
}
