import { discussionIdentity } from '@/lib/discussion-identity';
import { database, json, failure, requestBody, HttpError, publicSharingEnabled } from '@/lib/server';
import { guestDiscussion, acceptInvitation, addComment, removeComment } from '@/lib/research-discussion';
import { ShareError } from '@/lib/research-sharing';
type Context = { params: Promise<{ token: string }> };
const fail = (e: unknown) => failure(e instanceof ShareError ? new HttpError(e.message, e.status) : e);
async function viewer() {
  if (!publicSharingEnabled()) throw new HttpError('This invitation is unavailable.', 404);
  const session = await discussionIdentity(true);
  if (!session.user) throw new HttpError('Sign in to open this invitation.', 401);
  // Email is not used as an authorization key or exposed in the discussion.
  return { user: session.user, cookie: session.cookie };
}
function withCookie(response: Response, cookie?: string) { if (cookie) response.headers.append('Set-Cookie', cookie); return response; }
export async function GET(_request: Request, { params }: Context) {
  try { const { user, cookie } = await viewer(), { token } = await params; return withCookie(json(await guestDiscussion(database(), token, user)), cookie); }
  catch (e) { return fail(e); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const { user, cookie } = await viewer(), { token } = await params, b = await requestBody(request, 12000) as Record<string, unknown>;
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['action','id','body'].includes(k))) throw new HttpError('Invalid discussion request.');
    const db = database();
    if (b.action === 'accept') return withCookie(json(await acceptInvitation(db, token, user)), cookie);
    if (b.action === 'comment') await addComment(db, { token }, user, { id: b.id, body: b.body });
    else if (b.action === 'remove') await removeComment(db, { token }, user, b.id);
    else throw new HttpError('Invalid discussion action.');
    return withCookie(json({ ok: true }), cookie);
  } catch (e) { return fail(e); }
}
