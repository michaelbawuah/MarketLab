'use client';
import { friendlyError } from '@/lib/client-errors';
import { useEffect,useRef,useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ReplayReceipt } from '@/lib/finance/replay-receipt';

export default function ResearchReplay({id,receipt,onVerified}:{id:string;receipt?:ReplayReceipt;onVerified:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const current=useRef<AbortController|null>(null);
  useEffect(()=>()=>current.current?.abort(),[]);
  async function verify(){
    const controller=new AbortController();current.current=controller;setBusy(true);setError('');
    try{
      const response=await fetch('/api/research/replay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id}),signal:controller.signal});
      const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error??'Independent replay could not be completed.');
      if(!controller.signal.aborted)onVerified();
    }catch(e){if(!controller.signal.aborted)setError(friendlyError(e));}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="panel background-research" aria-label="Independent Python replay"><div><h2>Verify this result</h2><p>{receipt?'This result matches an independent calculation.':'Double-check this saved report using an independent calculation.'}</p>{error&&<p role="alert">{error}</p>}</div>{!receipt&&<Button onClick={()=>void verify()} disabled={busy}>{busy?'Checking saved report…':'Verify calculation'}</Button>}</section>;
}
