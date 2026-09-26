import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { database,publicSharingEnabled } from '@/lib/server';
import { readShare } from '@/lib/research-sharing';
import SharedResearchView from '../../shared-research-view';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Shared experiment · MarketLab',description:'A read-only hypothetical research summary.',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function SharedReport({params}:{params:Promise<{token:string}>}) {
  if(!publicSharingEnabled())notFound();
  const {token}=await params;
  const shared=await readShare(database(),token);
  if(!shared)notFound();
  return <main><SharedResearchView report={shared.report} expires={shared.expires}/></main>;
}
