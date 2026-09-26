import { identity,loadWorkspace,json,failure } from '@/lib/server';
export async function GET(){try{return json(await loadWorkspace(await identity()));}catch(e){return failure(e);}}
