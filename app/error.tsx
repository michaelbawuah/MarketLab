'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="recovery-page"><span className="eyebrow">MARKETLAB</span><h1>We couldn’t open this page.</h1><p>Please try again. If the problem continues, reload the page or return to your workspace.</p><div><Button onClick={reset}>Try again</Button><Button variant="outline" asChild><Link href="/">Open workspace</Link></Button></div></main>;
}
