'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Authentication requires a top-level, non-prefetched navigation. */
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ChartNoAxesCombined } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import QuickDemo from './quick-demo';
import { chatGPTSignInPath } from './chatgpt-auth';

export default function Welcome({ status, sharing, emailEnabled=false, emailError=false }: { status: number; sharing: boolean; emailEnabled?:boolean;emailError?:boolean }) {
  const [open, setOpen] = useState(emailError);
  return <div className="welcome"><a className="skip-link" href="#main-content">Skip to example</a>
    <header className="welcome-nav"><Link href="/" className="brand"><span className="brand-mark"><ChartNoAxesCombined size={22}/></span>MarketLab<span className="brand-period">.</span></Link><nav aria-label="Main navigation">{sharing&&<a href="/example">Sample report</a>}<Button variant="outline" onClick={()=>setOpen(true)}>Open workspace <ArrowRight size={16}/></Button></nav></header>
    <main id="main-content" className="welcome-main"><div className="welcome-heading"><span className="eyebrow">A LITTLE CLARITY FOR YOUR NEXT IDEA</span><h1>What happens to $10,000?</h1><p>Try a sample investment. Change the trading costs. See the difference.</p></div><QuickDemo guest onOpenData={()=>setOpen(true)}/></main>
    <footer className="welcome-footer"><span>MarketLab · Make sense of the numbers.</span><span>Educational tools. Not investment advice.</span><a href="/library">Strategy library</a><a href="/trust">Privacy & trust</a><a href="/status">Status</a><a href="/support">Support</a></footer>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Your own space for your investments</DialogTitle><DialogDescription>{status===401?'Create an account or sign in to save your portfolio and reports. They’ll be here when you return.':'Your workspace is temporarily unavailable. Please try again shortly.'}</DialogDescription></DialogHeader>{emailError&&<p role="alert" className="negative">We couldn’t finish signing you in. Please try again.</p>}{status===401&&<>{emailEnabled&&<Button asChild><a href="/api/discussion-auth/start?return_to=%2F" target="_top">Continue with email <ArrowRight size={16}/></a></Button>}<Button variant={emailEnabled?'outline':'default'} asChild><a href={emailEnabled?'/api/discussion-auth/chatgpt?return_to=%2F':chatGPTSignInPath('/')} target="_top">Continue with ChatGPT</a></Button><p className="form-note">Use the same sign-in method each time to open the same workspace.</p></>}<Button variant="ghost" onClick={()=>setOpen(false)}>Keep exploring the example</Button></DialogContent></Dialog>
  </div>;
}
