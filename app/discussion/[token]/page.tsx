import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getChatGPTUser, chatGPTSignInPath, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { publicSharingEnabled } from '@/lib/server';
import '@/app/discussion.css';
import GuestDiscussionView from '@/app/guest-discussion';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report discussion · MarketLab', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function DiscussionPage({ params }: { params: Promise<{ token: string }> }) {
  if (!publicSharingEnabled()) notFound();
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const user = await getChatGPTUser(), path = `/discussion/${token}`;
  return <main className="discussion-page">{user ? <><p className="discussion-account">Signed in as {user.displayName}. <a href={chatGPTSignOutPath(path)} target="_top">Switch account</a></p><GuestDiscussionView token={token}/></> : <section className="discussion-intro"><h1>Join a report discussion</h1><p>Sign in with ChatGPT to view the report and join the conversation.</p><a className="discussion-signin" href={chatGPTSignInPath(path)} target="_top">Sign in with ChatGPT</a></section>}</main>;
}
