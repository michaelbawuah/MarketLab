import { shareDigest, type SharedResearch } from './finance/shared-research.ts';
import { ownedResearch, ShareError } from './research-sharing.ts';

export type DiscussionUser = { userId: string; displayName: string };
export type Comment = { id: string; authorName: string; body: string | null; created: string; removed: boolean; canRemove: boolean; revision: number };
export type Invitation = { id: string; label: string; created: string; claimedName: string | null; claimedAt: string | null; revokedAt: string | null; revision: number };
export type OwnerDiscussion = { active: boolean; revision: number; invitations: Invitation[]; comments: Comment[] };
export type GuestDiscussion = { accepted: false } | { accepted: true; report: SharedResearch; expires: string; comments: Comment[] };
type InviteRow = { id: string; owner: string; run_id: string; share_revision: number; claimed_by: string | null; claimed_name: string | null; revoked_at: string | null; report: string; digest: string; expires: string };
type CommentRow = { id: string; author: string; author_name: string; body: string; created: string; removed_at: string | null; share_revision: number };
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const active = `s.revoked IS NULL AND s.expires > ${now}`;
const invitationAccess = `i.revoked_at IS NULL AND i.share_revision=s.revision AND ${active}`;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const unavailable = () => new ShareError('This invitation is unavailable or belongs to another account.', 404);
const changed = () => new ShareError('Access changed or a discussion limit was reached. Reload the discussion.', 409);
const commentSelect = 'id,author,author_name,CASE WHEN removed_at IS NULL THEN body ELSE \'\' END AS body,created,removed_at,share_revision';
function comments(rows: CommentRow[], userId: string, owner = false): Comment[] {
  return rows.map(r => ({ id: r.id, authorName: r.author_name, body: r.removed_at ? null : r.body, created: r.created, removed: !!r.removed_at, canRemove: !r.removed_at && (owner || r.author === userId), revision: r.share_revision }));
}
function text(value: unknown, max: number, field: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ShareError(`${field} must contain 1–${max} characters of plain text.`);
  return value.trim();
}
function requestId(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new ShareError('Invalid comment request ID.');
  return value;
}
function displayName(user: DiscussionUser) { return user.displayName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || 'Invited reader'; }
async function tokenHash(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw unavailable();
  return shareDigest(token);
}

export async function ownerDiscussion(db: D1Database, owner: string, id: string): Promise<OwnerDiscussion> {
  await ownedResearch(db, owner, id);
  const result = await db.batch([
    db.prepare(`SELECT revision,(${active}) AS active FROM research_shares s WHERE owner=? AND run_id=?`).bind(owner, id),
    db.prepare('SELECT id,label,created,claimed_name AS claimedName,claimed_at AS claimedAt,revoked_at AS revokedAt,share_revision AS revision FROM discussion_invites WHERE owner=? AND run_id=? ORDER BY created DESC,id LIMIT 100').bind(owner, id),
    db.prepare(`SELECT ${commentSelect} FROM discussion_comments WHERE owner=? AND run_id=? ORDER BY created,id LIMIT 500`).bind(owner, id),
  ]);
  const share = result[0].results[0] as { revision: number; active: number } | undefined;
  return { active: !!share?.active, revision: share?.revision ?? 0, invitations: result[1].results as Invitation[], comments: comments(result[2].results as CommentRow[], owner, true) };
}
export async function createInvitation(db: D1Database, owner: string, runId: string, revision: unknown, label: unknown) {
  const name = text(label, 80, 'Invitation label');
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) throw changed();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  const id = crypto.randomUUID();
  const r = await db.prepare(`INSERT INTO discussion_invites (id,owner,run_id,share_revision,token_hash,label,created)
    SELECT ?,s.owner,s.run_id,s.revision,?,?,${now} FROM research_shares s
    WHERE s.owner=? AND s.run_id=? AND s.revision=? AND ${active}
    AND (SELECT COUNT(*) FROM discussion_invites WHERE owner=s.owner AND run_id=s.run_id)<100`)
    .bind(id, await shareDigest(token), name, owner, runId, revision).run();
  if (r.meta.changes < 1) throw changed();
  return { path: `/discussion/${token}`, id };
}
export async function revokeInvitation(db: D1Database, owner: string, runId: string, id: unknown) {
  requestId(id);
  const r = await db.prepare(`UPDATE discussion_invites SET revoked_at=${now} WHERE owner=? AND run_id=? AND revoked_at IS NULL
    AND (id=? OR (claimed_by IS NOT NULL AND claimed_by=(SELECT claimed_by FROM discussion_invites WHERE id=? AND owner=? AND run_id=?)
    AND share_revision=(SELECT share_revision FROM discussion_invites WHERE id=? AND owner=? AND run_id=?)))`)
    .bind(owner, runId, id, id, owner, runId, id, owner, runId).run();
  if (r.meta.changes < 1) throw changed();
}
export async function acceptInvitation(db: D1Database, token: string, user: DiscussionUser) {
  const hash = await tokenHash(token);
  await db.prepare(`UPDATE discussion_invites SET claimed_by=?,claimed_name=?,claimed_at=${now}
    WHERE token_hash=? AND claimed_by IS NULL AND revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM research_shares s WHERE s.owner=discussion_invites.owner AND s.run_id=discussion_invites.run_id AND s.revision=discussion_invites.share_revision AND ${active})`)
    .bind(user.userId, displayName(user), hash).run();
  const state = await guestDiscussion(db, token, user);
  if (!state.accepted) throw unavailable();
  return state;
}
export async function guestDiscussion(db: D1Database, token: string, user: DiscussionUser): Promise<GuestDiscussion> {
  const hash = await tokenHash(token);
  const results = await db.batch([
    db.prepare(`SELECT i.*,s.report,s.digest,s.expires FROM discussion_invites i JOIN research_shares s ON s.owner=i.owner AND s.run_id=i.run_id
      WHERE i.token_hash=? AND ${invitationAccess} AND (i.claimed_by IS NULL OR i.claimed_by=?)`).bind(hash, user.userId),
    db.prepare(`SELECT ${commentSelect} FROM discussion_comments c WHERE EXISTS
      (SELECT 1 FROM discussion_invites i JOIN research_shares s ON s.owner=i.owner AND s.run_id=i.run_id
       WHERE i.token_hash=? AND i.claimed_by=? AND ${invitationAccess} AND c.owner=i.owner AND c.run_id=i.run_id AND c.share_revision=i.share_revision)
       ORDER BY created,id LIMIT 500`).bind(hash, user.userId),
  ]);
  const row = results[0].results[0] as InviteRow | undefined;
  if (!row) throw unavailable();
  if (!row.claimed_by) return { accepted: false };
  if (await shareDigest(row.report) !== row.digest) throw new ShareError('This report is temporarily unavailable.', 503);
  return { accepted: true, report: JSON.parse(row.report) as SharedResearch, expires: row.expires, comments: comments(results[1].results as CommentRow[], user.userId) };
}
export async function addComment(db: D1Database, context: { owner: string; runId: string; revision: unknown } | { token: string }, user: DiscussionUser, input: { id: unknown; body: unknown }) {
  const id = requestId(input.id), body = text(input.body, 2000, 'Comment');
  let scope: string, params: unknown[];
  if ('token' in context) {
    scope = `SELECT s.owner,s.run_id,s.revision FROM research_shares s JOIN discussion_invites i ON i.owner=s.owner AND i.run_id=s.run_id WHERE i.token_hash=? AND i.claimed_by=? AND ${invitationAccess}`;
    params = [await tokenHash(context.token), user.userId];
  } else {
    if (user.userId !== context.owner || !Number.isSafeInteger(context.revision)) throw changed();
    scope = `SELECT s.owner,s.run_id,s.revision FROM research_shares s WHERE s.owner=? AND s.run_id=? AND s.revision=? AND ${active}`;
    params = [context.owner, context.runId, context.revision];
  }
  // Authorization, quota and deduplication are evaluated within this one write.
  const r = await db.prepare(`WITH permitted AS (${scope})
    INSERT INTO discussion_comments (id,owner,run_id,share_revision,author,author_name,body,created)
    SELECT ?,p.owner,p.run_id,p.revision,?,?,?,${now} FROM permitted p
    WHERE (SELECT COUNT(*) FROM discussion_comments c WHERE c.owner=p.owner AND c.run_id=p.run_id)<500
    ON CONFLICT(id) DO NOTHING`).bind(...params, id, user.userId, displayName(user), body).run();
  if (r.meta.changes < 1) {
    // Only the same authorized author, report revision and payload may replay an ID.
    const existing = await db.prepare(`WITH permitted AS (${scope}) SELECT c.id FROM discussion_comments c JOIN permitted p ON c.owner=p.owner AND c.run_id=p.run_id AND c.share_revision=p.revision WHERE c.id=? AND c.author=? AND c.body=? AND c.removed_at IS NULL`).bind(...params, id, user.userId, body).first();
    if (!existing) throw changed();
  }
}
export async function removeComment(db: D1Database, context: { owner: string; runId: string } | { token: string }, user: DiscussionUser, value: unknown) {
  const id = requestId(value);
  let scope: string, params: unknown[];
  if ('token' in context) {
    scope = `author=? AND EXISTS (SELECT 1 FROM discussion_invites i JOIN research_shares s ON s.owner=i.owner AND s.run_id=i.run_id WHERE i.token_hash=? AND i.claimed_by=? AND ${invitationAccess} AND discussion_comments.owner=i.owner AND discussion_comments.run_id=i.run_id AND discussion_comments.share_revision=i.share_revision)`;
    params = [user.userId, await tokenHash(context.token), user.userId];
  } else {
    if (user.userId !== context.owner) throw changed();
    scope = 'owner=? AND run_id=?'; params = [context.owner, context.runId];
  }
  const r = await db.prepare(`UPDATE discussion_comments SET removed_at=${now},removed_by=?,body='' WHERE id=? AND removed_at IS NULL AND ${scope}`).bind(user.userId, id, ...params).run();
  if (r.meta.changes < 1) throw changed();
}
