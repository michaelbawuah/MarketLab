/** Called by the built-Worker gate. Uses real, disposable local D1 and emulated
 * dispatcher identities; no messages, invitations or data reach the live Site. */
import assert from 'node:assert/strict';
import type { OwnerDiscussion, GuestDiscussion } from '../lib/research-discussion.ts';

export async function testDiscussion({ request, db, base, owner, visitor, runId }: {
  request: (route: string, status: number, init?: RequestInit) => Promise<Response>;
  db: D1Database; base: string; owner: Record<string, string>; visitor: Record<string, string>; runId: string;
}) {
  let checks = 0;
  const post = (payload: unknown, headers = owner) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  const other = { 'oai-authenticated-user-id': 'club-member-two', 'oai-authenticated-user-email': 'second@marketlab.test' };
  const management = '/api/research/discussion';
  const ownerState = async () => (await request(`${management}?id=${runId}`, 200, { headers: owner })).json() as Promise<OwnerDiscussion>;
  const share = async () => {
    const p = await (await request(`/api/research/shares?id=${runId}`, 200, { headers: owner })).json() as { digest: string; status: { revision: number }; report: unknown };
    return await (await request('/api/research/shares', 200, post({ action: 'create', id: runId, revision: p.status.revision, digest: p.digest, days: 7, confirmed: true }))).json() as { path: string; status: { revision: number } };
  };
  const createInvite = async (label: string, revision: number) => {
    const r = await (await request(management, 201, post({ action: 'invite', runId, revision, label }))).json() as { id: string; path: string };
    return { ...r, api: r.path.replace('/discussion/', '/api/discussion/') };
  };
  await request(management, 401); await request(management, 404, { headers: visitor });
  await request(management, 409, post({ action: 'invite', runId, revision: 1, label: 'Denied' }, visitor));
  await request(management, 409, post({ action: 'invite', runId, revision: 2, label: 'No active share' }));
  const shared = await share(), revision = shared.status.revision;
  const invite = await createInvite('PRIVATE_INVITATION_LABEL', revision);
  await request(invite.api, 401);
  const anonymousHtml = await (await request(invite.path, 200)).text();
  assert.match(anonymousHtml, /Sign in with ChatGPT/); assert.ok(!anonymousHtml.includes('PRIVATE_INVITATION_LABEL')); checks += 2;
  const preclaim = await (await request(invite.api, 200, { headers: visitor })).json();
  assert.deepEqual(preclaim, { accepted: false }); checks++;
  const firstId = crypto.randomUUID();
  await request(invite.api, 409, post({ action: 'comment', id: firstId, body: 'Unaccepted' }, visitor));
  await request(invite.api, 403, post({ action: 'accept' }, { ...visitor, origin: 'https://unrelated.example.test' }));
  const accepted = await (await request(invite.api, 200, post({ action: 'accept' }, visitor))).json() as GuestDiscussion;
  assert.ok(accepted.accepted); if (!accepted.accepted) throw new Error('not accepted');
  const publicReport = await (await request(shared.path.replace('/share/', '/api/shared/'), 200)).json() as { report: unknown };
  assert.deepEqual(accepted.report, publicReport.report); assert.ok(!JSON.stringify(accepted).includes('PRIVATE_FIXTURE')); checks += 3;
  await request(invite.api, 200, post({ action: 'accept' }, visitor)); // same account retry
  await request(invite.api, 404, { headers: other }); await request(invite.api, 404, post({ action: 'accept' }, other));
  await request(invite.api, 400, post({ action: 'comment', id: firstId, body: 'x'.repeat(2001) }, visitor));
  const original = '<script>alert("text only")</script> Why did the strategy wait?';
  const first = { action: 'comment', id: firstId, body: original };
  await request(invite.api, 200, post(first, visitor)); await request(invite.api, 200, post(first, visitor));
  await request(invite.api, 409, post({ ...first, body: 'Different retry payload' }, visitor));
  const initial = await ownerState(); assert.equal(initial.comments.length, 1); assert.equal(initial.comments[0].body, original); checks += 2;
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM discussion_audit WHERE entity_id=? AND event='comment_created'").bind(firstId).first<{ n: number }>())!.n, 1); checks++;
  const ownerComment = crypto.randomUUID();
  await request(management, 200, post({ action: 'comment', runId, revision, id: ownerComment, body: 'Owner response' }));
  await request(invite.api, 409, post({ action: 'remove', id: ownerComment }, visitor));
  await request(invite.api, 200, post({ action: 'remove', id: firstId }, visitor));
  const removed = (await ownerState()).comments.find(c => c.id === firstId)!;
  assert.equal(removed.body, null); assert.equal(removed.removed, true); checks += 2;
  const audit = await db.prepare("SELECT detail FROM discussion_audit WHERE entity_id=? AND event='comment_created'").bind(firstId).first<{ detail: string }>();
  assert.equal(JSON.parse(audit!.detail).body, original); checks++;
  await assert.rejects(db.prepare('UPDATE discussion_audit SET detail=?').bind('tampered').run(), /append-only/);
  await assert.rejects(db.prepare('DELETE FROM discussion_audit').run(), /append-only/); checks += 2;
  const second = await createInvite('Second reader', revision);
  await request(second.api, 200, post({ action: 'accept' }, other));
  const visible = await (await request(second.api, 200, { headers: other })).json() as GuestDiscussion;
  assert.ok(visible.accepted && visible.comments.length === 2); checks++;
  const retained = crypto.randomUUID();
  await request(invite.api, 200, post({ action: 'comment', id: retained, body: 'Retained after revocation' }, visitor));
  const duplicateAccess = await createInvite('Same reader, second invitation', revision);
  await request(duplicateAccess.api, 200, post({ action: 'accept' }, visitor));
  await request(management, 200, post({ action: 'revoke', runId, id: invite.id }));
  await request(duplicateAccess.api, 404, { headers: visitor });
  await request(invite.api, 404, { headers: visitor }); await request(invite.api, 404, post({ action: 'accept' }, visitor));
  await request(invite.api, 409, post({ action: 'comment', id: crypto.randomUUID(), body: 'Stale tab' }, visitor));
  await request(invite.api, 409, post({ action: 'remove', id: retained }, visitor));
  assert.equal((await ownerState()).comments.find(c => c.id === retained)!.body, 'Retained after revocation'); checks++;
  await request(management, 200, post({ action: 'remove', runId, id: retained }));
  await request(shared.path.replace('/share/', '/api/shared/'), 200); // public report unaffected
  const raced = await createInvite('Single claimant', revision);
  const claims = await Promise.all([visitor, other].map(async h => { const r = await fetch(base + raced.api, post({ action: 'accept' }, h)); await r.text(); return r.status; }));
  assert.deepEqual(claims.sort(), [200, 404]); checks++;
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM discussion_audit WHERE entity_id=? AND event='invite_accepted'").bind(raced.id).first<{ n: number }>())!.n, 1); checks++;
  const rotated = await share();
  await request(second.api, 404, { headers: other });
  await request(second.api, 409, post({ action: 'comment', id: crypto.randomUUID(), body: 'Old revision' }, other));
  await request(management, 409, post({ action: 'invite', runId, revision, label: 'Stale owner tab' }));
  const fresh = await createInvite('New revision', rotated.status.revision);
  const freshState = await (await request(fresh.api, 200, post({ action: 'accept' }, visitor))).json() as GuestDiscussion;
  assert.ok(freshState.accepted && freshState.comments.length === 0); assert.equal((await ownerState()).comments.length, 3); checks += 2;
  // Expiry is rechecked by SQL, including mutations from an already-open tab.
  await db.prepare('UPDATE research_shares SET expires=? WHERE owner=? AND run_id=?').bind('2000-01-01T00:00:00Z', owner['oai-authenticated-user-id'], runId).run();
  await request(fresh.api, 404, { headers: visitor });
  await request(fresh.api, 409, post({ action: 'comment', id: crypto.randomUUID(), body: 'Expired' }, visitor));
  const events = await db.prepare('SELECT DISTINCT event FROM discussion_audit').all<{ event: string }>();
  for (const event of ['invite_created', 'invite_accepted', 'invite_revoked', 'comment_created', 'comment_removed', 'share_replaced', 'share_revoked']) { assert.ok(events.results.some(r => r.event === event), event); checks++; }
  const secrets = await db.prepare('SELECT detail FROM discussion_audit').all<{ detail: string }>();
  assert.ok(!JSON.stringify(secrets.results).includes(invite.path.split('/').at(-1)!)); checks++;
  console.log(`Discussion: ${checks} additional content/audit/concurrency assertions passed; HTTP checks included in Worker total.`);
  return checks;
}
