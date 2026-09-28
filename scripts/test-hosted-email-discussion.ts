/** AuthKit alone is mocked. The production Worker, SDK crypto/JWT verification,
 * D1 authorization, invitations and comments are real isolated test components. */
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { emailClient, emailConfig, EMAIL_SESSION_COOKIE, sessionCookie } from '../lib/discussion-email.ts';
import type { createFetchMock } from 'miniflare';
export const emailTestBindings = {
  DISCUSSION_EMAIL_AUTH_ENABLED: 'true', WORKOS_API_KEY: 'sk_test_fictional', WORKOS_CLIENT_ID: 'client_marketlabtest',
  WORKOS_COOKIE_PASSWORD: 'fictional-password-only-for-isolated-marketlab-tests', WORKOS_REDIRECT_URI: 'https://marketlab.test/api/discussion-auth/callback',
};
export async function testEmailDiscussion({ request, providerFetch, owner, runId }: {
  request: (route: string, status: number, init?: RequestInit) => Promise<Response>;
  providerFetch: ReturnType<typeof createFetchMock>; owner: Record<string, string>; runId: string;
}) {
  let checks = 0;
  const post = (payload: unknown, headers: Record<string, string> = owner) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  const p = await (await request(`/api/research/shares?id=${runId}`, 200, { headers: owner })).json() as { digest: string; status: { revision: number } };
  const share = await (await request('/api/research/shares', 200, post({ action: 'create', id: runId, revision: p.status.revision, digest: p.digest, days: 7, confirmed: true }))).json() as { status: { revision: number } };
  const invite = await (await request('/api/research/discussion', 201, post({ action: 'invite', runId, revision: share.status.revision, label: 'Email test reader' }))).json() as { id: string; path: string };
  const api = invite.path.replace('/discussion/', '/api/discussion/'), query = '?return_to=' + encodeURIComponent(invite.path);
  const html = await (await request(invite.path, 200)).text();
  assert.ok(html.includes('Continue with email') && html.includes('Sign in with ChatGPT')); checks++;
  await request('/api/discussion-auth/start?return_to=https://evil.test', 400);
  await request('/api/discussion-auth/start?return_to=' + encodeURIComponent('/discussion/' + '0'.repeat(64)), 404);
  const login = await request('/api/discussion-auth/start' + query, 303, { redirect: 'manual' });
  const url = new URL(login.headers.get('location')!), state = url.searchParams.get('state')!, flowCookie = login.headers.getSetCookie()[0].split(';')[0];
  assert.ok(!url.href.includes(invite.path.split('/').at(-1)!)); assert.match(login.headers.get('referrer-policy')!, /no-referrer/); checks += 2;
  const callback = '/api/discussion-auth/callback?code=fictional-code&state=' + state;
  await request(callback, 400, { redirect: 'manual' }); // another browser cannot finish this flow
  await request(callback.replace(state, 'wrong'), 400, { redirect: 'manual', headers: { cookie: flowCookie } });
  const cancelled = await request('/api/discussion-auth/callback?error=access_denied&state=' + state, 303, { redirect: 'manual', headers: { cookie: flowCookie } });
  assert.equal(cancelled.headers.get('location'), invite.path + '?email_error=1'); checks++;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', use: 'sig', kid: 'fictional-signing-key' };
  const profile = { object: 'user', id: 'user_emailreader', email: 'reader@marketlab.test', email_verified: true, first_name: null, last_name: null, profile_picture_url: null, created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z', external_id: null, metadata: {} };
  function authResponse(options: { expires?: number; verified?: boolean; issuer?: string; clientId?: string; audience?: string | string[] } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: key.kid })).toString('base64url');
    // Match the application's live WorkOS OIDC discovery document and Node SDK
    // example: the issuer includes the configured application client ID.
    const payload = Buffer.from(JSON.stringify({ sub: profile.id, sid: 'session_emailreader', iss: options.issuer ?? `https://api.workos.com/user_management/${emailTestBindings.WORKOS_CLIENT_ID}`, client_id: options.clientId ?? emailTestBindings.WORKOS_CLIENT_ID, ...(options.audience === undefined ? {} : { aud: options.audience }), iat: now - 60, exp: options.expires ?? now + 600 })).toString('base64url');
    const token = `${header}.${payload}.${sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url')}`;
    return { user: { ...profile, email_verified: options.verified ?? true }, access_token: token, refresh_token: 'fictional-refresh-token', authentication_method: 'MagicAuth' };
  }
  providerFetch.get('https://api.workos.com').intercept({ path: '/sso/jwks/' + emailTestBindings.WORKOS_CLIENT_ID }).reply(200, { keys: [key] }, { headers: { 'content-type': 'application/json' } }).persist();
  providerFetch.get('https://api.workos.com').intercept({ method: 'POST', path: '/user_management/authenticate' }).reply(200, authResponse(), { headers: { 'content-type': 'application/json' } });
  const authenticated = await request(callback, 303, { redirect: 'manual', headers: { cookie: flowCookie } });
  assert.equal(authenticated.headers.get('location'), invite.path); checks++;
  const setCookie = authenticated.headers.getSetCookie().find(c => c.startsWith(EMAIL_SESSION_COOKIE + '='));
  assert.ok(setCookie); assert.match(setCookie, /HttpOnly; Secure; SameSite=Lax/); checks += 2;
  const cookie = setCookie.split(';')[0], guest = { cookie };
  assert.ok(!(await (await request(invite.path, 200, { headers: guest })).text()).includes('Continue with email')); checks++;
  await request(api, 200, { headers: guest });
  await request(api, 200, post({ action: 'accept' }, guest));
  await request(api, 200, post({ action: 'comment', id: crypto.randomUUID(), body: 'Email guest question' }, guest));
  await request('/api/research/replay',401,post({id:runId},guest));
  const thread = await (await request(api, 200, { headers: guest })).json() as { comments: { authorName: string; body: string }[] };
  assert.equal(thread.comments[0].authorName, 'Invited reader'); assert.equal(thread.comments[0].body, 'Email guest question'); assert.ok(!JSON.stringify(thread).includes(profile.email)); checks += 3;
  for (const route of ['/api/workspace', '/api/research', '/api/research/discussion']) await request(route, 401, { headers: guest });
  await request(api, 404, { headers: { 'oai-authenticated-user-id': 'same-email-chatgpt', 'oai-authenticated-user-email': profile.email } });
  await request(api, 401, { headers: { cookie: `${EMAIL_SESSION_COOKIE}=tampered` } });
  // Prepare expired/unverified sessions using the same official SDK and a fake
  // token-exchange response. This never adds a test bypass to application code.
  async function sealedFixture(options: Parameters<typeof authResponse>[0]) {
    const original = globalThis.fetch;
    globalThis.fetch = async () => Response.json(authResponse(options));
    try {
      const result = await emailClient(emailConfig(emailTestBindings)!).userManagement.authenticateWithCode({ code: 'fixture', session: { sealSession: true, cookiePassword: emailTestBindings.WORKOS_COOKIE_PASSWORD } });
      return sessionCookie(result.sealedSession!).split(';')[0];
    } finally { globalThis.fetch = original; }
  }
  await request(api, 401, { headers: { cookie: await sealedFixture({ verified: false }) } });
  for (const issuer of ['https://api.workos.com', 'https://api.workos.com/']) {
    await request(api, 200, { headers: { cookie: await sealedFixture({ issuer }) } });
  }
  for (const issuer of [
    'https://wrong-issuer.test/', 'http://api.workos.com', 'https://api.workos.com/extra', 'https://api.workos.com.attacker.test',
    'https://api.workos.com/user_management/client_another_app',
    `https://api.workos.com/user_management/${emailTestBindings.WORKOS_CLIENT_ID}/`,
    `https://api.workos.com/user_management/${emailTestBindings.WORKOS_CLIENT_ID}/extra`,
    `https://api.workos.com/user_management/${emailTestBindings.WORKOS_CLIENT_ID}?extra=1`,
  ]) {
    await request(api, 401, { headers: { cookie: await sealedFixture({ issuer }) } });
  }
  await request(api, 401, { headers: { cookie: await sealedFixture({ clientId: 'client_another_app' }) } });
  await request(api, 401, { headers: { cookie: await sealedFixture({ audience: 'client_another_app' }) } });
  await request(api, 200, { headers: { cookie: await sealedFixture({ audience: [emailTestBindings.WORKOS_CLIENT_ID] }) } });
  const expired = await sealedFixture({ expires: Math.floor(Date.now() / 1000) - 60 });
  providerFetch.get('https://api.workos.com').intercept({ method: 'POST', path: '/user_management/authenticate' }).reply(200, authResponse(), { headers: { 'content-type': 'application/json' } });
  const refreshed = await request(api, 200, { headers: { cookie: expired } });
  assert.ok(refreshed.headers.getSetCookie().some(c => c.startsWith(EMAIL_SESSION_COOKIE + '='))); checks++;
  await request('/api/discussion-auth/logout' + query, 403, { method: 'POST', headers: { ...guest, origin: 'https://evil.test' } });
  await request('/api/discussion-auth/logout' + query, 403, { method: 'POST', headers: guest });
  providerFetch.get('https://api.workos.com').intercept({ method: 'POST', path: '/user_management/sessions/revoke' }).reply(204);
  const logout = await request('/api/discussion-auth/logout' + query, 303, { method: 'POST', redirect: 'manual', headers: { ...guest, origin: 'https://marketlab.test' } });
  assert.ok(logout.headers.getSetCookie().some(c => c.startsWith(EMAIL_SESSION_COOKIE + '=') && c.includes('Max-Age=0'))); checks++;
  await request('/api/research/discussion', 200, post({ action: 'revoke', runId, id: invite.id }));
  await request(api, 404, { headers: guest });
  await request(api, 409, post({ action: 'comment', id: crypto.randomUUID(), body: 'Revoked guest' }, guest));
  await request('/api/discussion-auth/start' + query, 404);
  const switched = await request('/api/discussion-auth/chatgpt' + query, 303, { redirect: 'manual', headers: guest });
  assert.ok(switched.headers.get('location')!.startsWith('/signin-with-chatgpt?')); assert.ok(switched.headers.getSetCookie().some(c => c.includes('Max-Age=0'))); checks += 2;
  providerFetch.assertNoPendingInterceptors();
  console.log(`Email discussion: ${checks} additional AuthKit/identity assertions passed; no live email or real accounts used.`);
  return checks;
}
