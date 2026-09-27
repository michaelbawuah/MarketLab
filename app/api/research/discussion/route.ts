import { database, identity, json, failure, requestBody, HttpError, publicSharingEnabled } from '@/lib/server';
import { ownerDiscussion, createInvitation, revokeInvitation, addComment, removeComment } from '@/lib/research-discussion';
import { ShareError } from '@/lib/research-sharing';
const fail = (e: unknown) => failure(e instanceof ShareError ? new HttpError(e.message, e.status) : e);
export async function GET(request: Request) {
  try { return json(await ownerDiscussion(database(), await identity(), new URL(request.url).searchParams.get('id') ?? '')); }
  catch (e) { return fail(e); }
}
export async function POST(request: Request) {
  try {
    const owner = await identity(), b = await requestBody(request, 12000) as Record<string, unknown>;
    if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.runId !== 'string' || !/^[a-f0-9]{64}$/.test(b.runId) || Object.keys(b).some(k => !['action','runId','revision','label','id','body'].includes(k))) throw new HttpError('Invalid discussion request.');
    const db = database();
    if (b.action === 'invite') {
      if (!publicSharingEnabled()) throw new HttpError('Report sharing is unavailable.', 503);
      return json(await createInvitation(db, owner, b.runId, b.revision, b.label), 201);
    }
    if (b.action === 'revoke') await revokeInvitation(db, owner, b.runId, b.id);
    else if (b.action === 'comment') {
      if (!publicSharingEnabled()) throw new HttpError('Report sharing is unavailable.', 503);
      await addComment(db, { owner, runId: b.runId, revision: b.revision }, { userId: owner, displayName: 'Report owner' }, { id: b.id, body: b.body });
    } else if (b.action === 'remove') await removeComment(db, { owner, runId: b.runId }, { userId: owner, displayName: 'Report owner' }, b.id);
    else throw new HttpError('Invalid discussion action.');
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
