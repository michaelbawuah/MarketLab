import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { chatGPTSignInPath, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { publicSharingEnabled } from '@/lib/server';
import { emailConfig } from '@/lib/discussion-email';
import { discussionIdentity } from '@/lib/discussion-identity';
import '@/app/discussion.css';
import GuestDiscussionView from '@/app/guest-discussion';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Report discussion · MarketLab', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function DiscussionPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ email_error?: string }> }) {
  if (!publicSharingEnabled()) notFound();
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  return <DiscussionBody token={token} emailError={(await searchParams).email_error === '1'}/>;
}
async function DiscussionBody({ token, emailError }: { token: string; emailError: boolean }) {
  const path = `/discussion/${token}`, query = `?return_to=${encodeURIComponent(path)}`, emailEnabled = !!emailConfig(env);
  let session: Awaited<ReturnType<typeof discussionIdentity>> = { user: null }, unavailable = false;
  try { session = await discussionIdentity(); } catch { unavailable = true; }
  if (session.needsRefresh) redirect(`/api/discussion-auth/refresh${query}`);
  const user = session.user;
  return <main className="discussion-page">
    {(emailError || unavailable) && <p className="discussion-error" role="alert">Email sign-in couldn’t be completed. Please try again.</p>}
    {user ? <>
      <div className="discussion-account"><p>Signed in as {user.accountLabel}.</p>{user.provider === 'email'
        ? <form method="POST" action={`/api/discussion-auth/logout${query}`}><button type="submit">Sign out</button></form>
        : <a href={chatGPTSignOutPath(path)} target="_top">Switch account</a>}</div>
      <GuestDiscussionView token={token}/>
    </> : <section className="discussion-intro"><h1>Join a report discussion</h1><p>Sign in to view the report and join the conversation.</p>
      <div className="discussion-signin-options">
        {emailEnabled && <a className="discussion-signin" href={`/api/discussion-auth/start${query}`} target="_top">Continue with email</a>}
        <a className={`discussion-signin${emailEnabled ? ' discussion-signin-secondary' : ''}`} href={emailEnabled ? `/api/discussion-auth/chatgpt${query}` : chatGPTSignInPath(path)} target="_top">Sign in with ChatGPT</a>
      </div>
    </section>}
  </main>;
}
