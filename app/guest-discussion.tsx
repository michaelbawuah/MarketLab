'use client';
import { friendlyError } from '@/lib/client-errors';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GuestDiscussion } from '@/lib/research-discussion';
import SharedResearchView from './shared-research-view';
import DiscussionThread, { discussionResponse } from './discussion-thread';
import './discussion.css';
export default function GuestDiscussionView({ token }: { token: string }) {
  const [state, setState] = useState<GuestDiscussion | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const endpoint = `/api/discussion/${token}`;
  const reload = useCallback(async () => { try { const s = await fetch(endpoint, { cache: 'no-store' }).then(discussionResponse<GuestDiscussion>); setState(s); setError(''); } catch (e) { const err = e as Error & { status?: number }; if (err.status === 401 || err.status === 404) setState(null); throw e; } }, [endpoint]);
  useEffect(() => { const refresh = () => { void reload().catch(e => setError(friendlyError(e))); }; refresh(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [reload]);
  async function action(payload: Record<string, unknown>) {
    setBusy(true); setError('');
    try { await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(discussionResponse); await reload(); return true; }
    catch (e) { setError(friendlyError(e)); return false; } finally { setBusy(false); }
  }
  return <>{error && <p className="discussion-error" role="alert">{error}</p>}{!state && !error && <p role="status">Loading invitation…</p>}
    {state && !state.accepted && <section className="discussion-intro"><h1>Accept this report invitation</h1><p>Join the conversation to ask questions and share your thoughts on this report.</p><Button disabled={busy} onClick={() => void action({ action: 'accept' })}>{busy ? 'Accepting…' : 'Accept invitation'}</Button></section>}
    {state?.accepted && <><section className="discussion-guest"><DiscussionThread comments={state.comments} busy={busy} action={action}/></section><SharedResearchView report={state.report} expires={state.expires} invited/></>}
    <Button variant="outline" disabled={busy} onClick={() => void reload().catch(e => setError(friendlyError(e)))}>Refresh discussion</Button>
  </>;
}
