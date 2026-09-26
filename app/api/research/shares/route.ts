import { database,identity,json,failure,requestBody,HttpError,publicSharingEnabled } from '@/lib/server';
import { sharingPreview,createShare,revokeShare,ShareError } from '@/lib/research-sharing';
export async function GET(request:Request) {
  try{return json({...await sharingPreview(database(),await identity(),new URL(request.url).searchParams.get('id')??''),enabled:publicSharingEnabled()});}
  catch(e){return failure(e instanceof ShareError?new HttpError(e.message,e.status):e);}
}
export async function POST(request:Request) {
  try {
    const owner=await identity(),body=await requestBody(request,4096) as Record<string,unknown>;
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','id','revision','digest','days','confirmed'].includes(k))||typeof body.id!=='string'||typeof body.revision!=='number')throw new HttpError('Invalid sharing request.');
    if(body.action==='create') {
      if(!publicSharingEnabled())throw new HttpError('Public report links are not enabled for this site yet. You can review the summary now.',503);
      return json(await createShare(database(),owner,{id:body.id,revision:body.revision,digest:body.digest as string,days:body.days as number,confirmed:body.confirmed as boolean}));
    }
    if(body.action==='revoke')return json({status:await revokeShare(database(),owner,body.id,body.revision)});
    throw new HttpError('Invalid sharing action.');
  }catch(e){return failure(e instanceof ShareError?new HttpError(e.message,e.status):e);}
}
