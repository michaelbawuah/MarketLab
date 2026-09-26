import Dashboard from './workspace';
import { initialWorkspace } from '@/lib/finance/demo';
import { identity, HttpError, publicSharingEnabled } from '@/lib/server';
import { chatGPTSignInPath } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  try { await identity(); }
  catch(e) {
    const status=e instanceof HttpError?e.status:503;
    return <main style={{maxWidth:580,margin:'15vh auto',padding:24,lineHeight:1.8}}><h1 style={{fontSize:28,fontWeight:600}}>MarketLab workspace</h1><p>{status===401?'Sign in to open your private research workspace.':status===403?'This workspace is private. You can still open a report link its owner shared with you.':'The workspace is temporarily unavailable. Please try again shortly.'}</p>{status===401&&<a href={chatGPTSignInPath('/')} target="_top" style={{display:'inline-block',marginTop:20,textDecoration:'underline'}}>Sign in with ChatGPT</a>}{publicSharingEnabled()&&<p style={{marginTop:20}}><a href="/example" style={{textDecoration:'underline'}}>View a fictional example</a></p>}</main>;
  }
  return <Dashboard initial={initialWorkspace()}/>;
}
