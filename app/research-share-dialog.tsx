'use client';
import { friendlyError } from '@/lib/client-errors';
import { useEffect,useState } from 'react';
import { Share2,Copy,Link2,Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import type { SharedResearch } from '@/lib/finance/shared-research';
import type { ShareStatus } from '@/lib/research-sharing';
import SharedResearchView from './shared-research-view';
import './research-sharing.css';
type Preview={report:SharedResearch;digest:string;status:ShareStatus;enabled:boolean};
async function read<T>(response:Response):Promise<T>{const value=await response.json() as {error?:string};if(!response.ok)throw new Error(value.error??'Sharing is temporarily unavailable.');return value as T;}
export default function ResearchShareDialog({id}:{id:string}) {
  const [open,setOpen]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[confirmed,setConfirmed]=useState(false),[days,setDays]=useState('7'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[link,setLink]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{if(!open)return;const c=new AbortController();void fetch(`/api/research/shares?id=${id}`,{signal:c.signal,cache:'no-store'}).then(read<Preview>).then(v=>{if(!c.signal.aborted)setPreview(v);}).catch(e=>{if(!c.signal.aborted)setError(friendlyError(e));});return()=>c.abort();},[open,id,reload]);
  function reset(){setPreview(null);setConfirmed(false);setError('');setLink('');setMessage('');}
  async function action(kind:'create'|'revoke') {
    if(!preview)return;setBusy(true);setError('');setMessage('');
    try {const result=await fetch('/api/research/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind,id,revision:preview.status.revision,...(kind==='create'?{digest:preview.digest,days:Number(days),confirmed}:{})})}).then(read<{status:ShareStatus;path?:string}>);setPreview({...preview,status:result.status});setConfirmed(false);setLink(result.path?new URL(result.path,window.location.origin).href:'');setMessage(kind==='create'?'Link created. Copy it before closing this dialog. You can create a replacement later.':'Link revoked. It no longer opens the report.');}
    catch(e){setError(friendlyError(e));}finally{setBusy(false);}
  }
  async function copy(){try{await navigator.clipboard.writeText(link);setMessage('Link copied.');}catch{setMessage('Select and copy the link below.');}}
  return <><Button onClick={()=>{reset();setOpen(true);}}><Share2 size={16}/> Share report</Button><Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}><DialogContent className="share-dialog"><DialogHeader><DialogTitle>Share this report</DialogTitle><DialogDescription>Review what other people will see before creating a read-only link.</DialogDescription></DialogHeader>
    {!preview&&!error&&<p role="status">Preparing the public summary…</p>}
    {error&&<div role="alert" className="share-error"><p>{error}</p><Button variant="outline" disabled={busy} onClick={()=>{reset();setReload(n=>n+1);}}>Reload preview</Button></div>}
    {preview&&<>{!preview.enabled&&<p className="share-activation" role="status">Public report links are not enabled for this site yet. You can review the summary below; it has not been shared.</p>}<div className="share-boundary"><strong>Anyone with the link can view and download this report.</strong><p>Review the report below, then choose how long the link stays active.</p><details><summary>Sharing details</summary><p>The summary includes the stock, dates, settings, results, trades, events, and calculation checks. Personal account data and original input files are excluded. Revoking stops future access; copies already downloaded remain with their recipients.</p></details></div>
      <details className="share-full-preview"><summary>Review the complete public report</summary><SharedResearchView report={preview.report} preview/></details>
      {preview.status.active&&<div className="share-active"><Link2 size={19}/><p>An active link expires {new Date(preview.status.expires!).toISOString().slice(0,16).replace('T',' ')} UTC. Creating another link replaces it.</p><Button variant="outline" disabled={busy} onClick={()=>void action('revoke')}><Link2Off size={16}/> Revoke link</Button></div>}
      <label className="share-expiry" htmlFor="share-days">Link expires after<NativeSelect id="share-days" value={days} disabled={busy} onChange={e=>{setDays(e.target.value);setConfirmed(false);}}><option value="7">7 days</option><option value="30">30 days</option></NativeSelect></label>
      <label className="share-confirm"><Checkbox checked={confirmed} disabled={busy||!preview.enabled} onCheckedChange={v=>setConfirmed(v===true)}/><span>I reviewed the summary and want anyone with the link to be able to read it{preview.status.active?', replacing the current link':''}.</span></label>
      <Button disabled={!confirmed||busy||!preview.enabled} onClick={()=>void action('create')}>{busy?'Saving…':preview.status.active?'Replace sharing link':'Create read-only link'}</Button>
      {message&&<p role="status" className="share-message">{message}</p>}
      {link&&<div className="share-link"><label htmlFor="created-share-link">Your report link</label><Input id="created-share-link" readOnly value={link} onFocus={e=>e.target.select()}/><div><Button variant="outline" onClick={()=>void copy()}><Copy size={16}/> Copy link</Button><Button variant="outline" asChild><a href={link} target="_blank" rel="noopener noreferrer">Open public report</a></Button></div></div>}
    </>}
  </DialogContent></Dialog></>;
}
