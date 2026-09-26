import { database,json,failure,HttpError,publicSharingEnabled } from '@/lib/server';
import { readShare,ShareError } from '@/lib/research-sharing';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}) {
  try {
    if(!publicSharingEnabled())throw new HttpError('This report link is unavailable, expired or revoked.',404);
    const value=await readShare(database(),(await params).token);
    if(!value)throw new HttpError('This report link is unavailable, expired or revoked.',404);
    return json(value);
  }catch(e){return failure(e instanceof ShareError?new HttpError(e.message,e.status):e);}
}
