'use client';
import { friendlyError } from '@/lib/client-errors';
import { useState, type ComponentProps } from 'react';
import { toast } from 'sonner';

/** Read the authenticated report response before creating a browser download. */
export default function ReportDownload({href,children,...props}: ComponentProps<'a'> & {href:string}) {
  const [busy,setBusy]=useState(false);
  const disabled=busy||props['aria-disabled']===true||props['aria-disabled']==='true';
  return <a {...props} href={href} download aria-busy={busy} aria-disabled={disabled} onClick={async event=>{
    event.preventDefault();if(disabled)return;setBusy(true);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetch(href,{cache:'no-store',signal:controller.signal});
      if(!response.ok){const error:unknown=await response.json().catch(()=>null);throw new Error(error&&typeof error==='object'&&'error' in error&&typeof error.error==='string'?error.error:'The report could not be prepared. Please try again.');}
      if(!['application/json','text/csv'].includes((response.headers.get('Content-Type')??'').split(';')[0].trim()))throw new Error('The report is unavailable. Reload MarketLab and try again.');
      const blob=await response.blob();if(!blob.size)throw new Error('The report was empty. Please try again.');
      const disposition=response.headers.get('Content-Disposition')??'',filename=disposition.match(/filename="([^"\r\n]+)"/)?.[1]??'marketlab-report';
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename.replaceAll(/[\\/]/g,'_');document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){toast.error(friendlyError(e, 'The report couldn’t be downloaded. Please try again.'));}
    finally{clearTimeout(timeout);setBusy(false);}
  }}>{busy?'Preparing report…':children}</a>;
}
