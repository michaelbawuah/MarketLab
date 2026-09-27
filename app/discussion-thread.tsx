'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import type { Comment } from '@/lib/research-discussion';
export type DiscussionAction = (payload: Record<string, unknown>) => Promise<boolean>;
export async function discussionResponse<T>(response: Response): Promise<T> {
  const value = await response.json() as { error?: string };
  if (!response.ok) throw Object.assign(new Error(value.error || 'Discussion is temporarily unavailable.'), { status: response.status });
  return value as T;
}
export default function DiscussionThread({ comments, active = true, revision, busy, action }: { comments: Comment[]; active?: boolean; revision?: number; busy: boolean; action: DiscussionAction }) {
  const [body, setBody] = useState(''), [removing, setRemoving] = useState<string | null>(null), requestId = useRef('');
  async function submit() {
    if (!body.trim() || busy) return;
    requestId.current ||= crypto.randomUUID();
    if (await action({ action: 'comment', id: requestId.current, body })) { setBody(''); requestId.current = ''; }
  }
  return <section className="discussion-thread"><h2>Discussion</h2><p className="discussion-note">Visible to the report owner and active invitees. Comments are plain text. Removed text is retained in a private audit record.</p>
    {!comments.length && <p className="discussion-empty">No comments yet. Start with a question about the results or assumptions.</p>}
    <ol className="discussion-comments">{comments.map(c => <li key={c.id}><div className="discussion-comment-meta"><strong>{c.authorName}</strong><time dateTime={c.created}>{c.created.slice(0, 16).replace('T', ' ')} UTC</time>{revision !== undefined && c.revision !== revision && <span>Earlier report version</span>}</div><p className={c.removed ? 'discussion-removed' : ''}>{c.removed ? 'Comment removed.' : c.body}</p>{c.canRemove && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRemoving(c.id)}>Remove comment</Button>}</li>)}</ol>
    {active && <form onSubmit={e => { e.preventDefault(); void submit(); }}><label htmlFor="discussion-comment">Add a comment</label><Textarea id="discussion-comment" maxLength={2000} value={body} disabled={busy} onChange={e => { setBody(e.target.value); requestId.current = ''; }} placeholder="Ask a question or share an observation…"/><div className="discussion-compose-footer"><span>{body.length}/2,000</span><Button type="submit" disabled={busy || !body.trim()}>{busy ? 'Saving…' : 'Post comment'}</Button></div></form>}
    <AlertDialog open={!!removing} onOpenChange={v => { if (!v) setRemoving(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this comment?</AlertDialogTitle><AlertDialogDescription>The discussion will show a removal notice. The original text remains in the private audit record.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep comment</AlertDialogCancel><AlertDialogAction onClick={() => { if (removing) void action({ action: 'remove', id: removing }); setRemoving(null); }}>Remove comment</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
