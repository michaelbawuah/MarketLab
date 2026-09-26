import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { calculateDemo } from '@/lib/finance/quick-demo';
import { publicResearch } from '@/lib/finance/shared-research';
import { publicSharingEnabled } from '@/lib/server';
import SharedResearchView from '../shared-research-view';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Fictional example · MarketLab',description:'A public, read-only example using invented prices and hypothetical cash.',robots:{index:false,follow:false},referrer:'no-referrer'};

export default async function PublicExample() {
  if(!publicSharingEnabled())notFound();
  // This uses only the existing deterministic teaching fixture. It neither
  // reads nor creates any owner's saved experiment, share or brokerage record.
  const report=publicResearch(await calculateDemo('illustrative'));
  return <main><SharedResearchView report={report} example/></main>;
}
