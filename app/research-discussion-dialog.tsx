'use client';
import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import type { OwnerDiscussion } from '@/lib/research-discussion';
import DiscussionThread, { discussionResponse } from './discussion-thread';
import './discussion.css';
export default function ResearchDiscussionDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false), [state, setState] = useState<OwnerDiscussion | null>(null), [label, setLabel] = useState(''), [link, setLink] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [revoking, setRevoking] = useState<string | null>(null);
  const reload = useCallback(async () => { const s = await fetch(`/api/research/discussion?id=${id}`, { cache: 'no-store' }).then(discussionResponse<OwnerDiscussion>); setState(s); }, [id]);
  useEffect(() => { if (!open) return; let live = true; void fetch(`/api/research/discussion?id=${id}`, { cache: 'no-store' }).then(discussionResponse<OwnerDiscussion>).then(s => { if (live) setState(s); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, [open, id]);
  async function action(payload: Record<string, unknown>) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await fetch('/api/research/discussion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, runId: id, revision: state?.revision }) }).then(discussionResponse<{ path?: string }>);
      if (result.path) { setLink(new URL(result.path, window.location.origin).href); setLabel(''); setMessage('Invitation created. Copy this link before closing; it is shown only once.'); }
      else if (payload.action === 'revoke') { setLink(''); setMessage('Invitation revoked. Existing comments are retained.'); }
      await reload(); return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }
  return <><Button variant="outline" onClick={() => { setState(null); setError(''); setLink(''); setMessage(''); setOpen(true); }}><MessageSquare size={16}/> Discussion</Button><Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}><DialogContent className="discussion-dialog"><DialogHeader><DialogTitle>Invite-only discussion</DialogTitle><DialogDescription>Invite someone to join the discussion on this report.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="discussion-error">{error}</p>}{message && <p role="status">{message}</p>}
    {!state && !error && <p role="status">Loading discussion…</p>}
    {state && <>{!state.active ? <p className="discussion-boundary">Create an active link using <strong>Share report</strong> first. Earlier discussion remains here for your records.</p> : <><p className="discussion-boundary">Create a separate invitation for each person. Each link can be accepted once and stays connected to that person’s account.</p><form onSubmit={e => { e.preventDefault(); void action({ action: 'invite', label }); }}><label htmlFor="invite-label">Invitation label</label><Input id="invite-label" value={label} maxLength={80} placeholder="For example, investment club — Alex" disabled={busy} onChange={e => setLabel(e.target.value)}/><Button disabled={busy || !label.trim()} type="submit">Create invitation link</Button></form></>}
    {link && <div className="discussion-link"><label htmlFor="invitation-link">Copy and send this invitation yourself</label><Input id="invitation-link" readOnly value={link} onFocus={e => e.target.select()}/><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage('Invitation link copied.'); } catch { setMessage('Select and copy the invitation link above.'); } }}><Copy size={16}/> Copy invitation</Button></div>}
    {!!state.invitations.length && <details className="discussion-invitations" open><summary>Invitations ({state.invitations.length}/100)</summary><ul>{state.invitations.map(i => <li key={i.id}><div><strong>{i.label}</strong><p>{i.revokedAt ? 'Revoked' : i.revision !== state.revision || !state.active ? 'Report link inactive' : i.claimedAt ? `Accepted by ${i.claimedName}` : 'Awaiting acceptance'}</p></div>{!i.revokedAt && i.revision === state.revision && state.active && <Button variant="outline" size="sm" disabled={busy} onClick={() => setRevoking(i.id)}>Revoke</Button>}</li>)}</ul></details>}
    <DiscussionThread comments={state.comments} active={state.active} revision={state.revision} busy={busy} action={action}/></>}
    <Button variant="ghost" disabled={busy} onClick={() => { setError(''); void reload().catch(e => setError(e.message)); }}>Refresh discussion</Button>
  </DialogContent></Dialog><AlertDialog open={!!revoking} onOpenChange={v => { if (!v) setRevoking(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke this invitation?</AlertDialogTitle><AlertDialogDescription>This account will lose discussion access. Existing comments stay in the record. Access through a separate public report link is unchanged.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep access</AlertDialogCancel><AlertDialogAction onClick={() => { if (revoking) void action({ action: 'revoke', id: revoking }); setRevoking(null); }}>Revoke invitation</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
