'use client';
import { Button } from '@/components/ui/button';
export default function ReportError({reset}:{reset:()=>void}) {
  return <main style={{maxWidth:600,margin:'12vh auto',padding:24,lineHeight:1.8,color:'#304b3c'}}>
    <h1 style={{fontSize:'2rem',fontWeight:600,marginBottom:16}}>The report could not be loaded</h1>
    <p style={{marginBottom:20}}>Please try again shortly. No changes were made to the experiment.</p>
    <Button onClick={reset}>Try again</Button>
  </main>;
}
