import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beginEmailLogin, discussionReturnPath, emailConfig, EMAIL_FLOW_COOKIE, readEmailCookie, verifyEmailFlow } from '../../lib/discussion-email.ts';
const env = { DISCUSSION_EMAIL_AUTH_ENABLED: 'true', WORKOS_API_KEY: 'sk_test_fictional', WORKOS_CLIENT_ID: 'client_test', WORKOS_COOKIE_PASSWORD: 'fictional-password-for-tests-only-32-characters', WORKOS_REDIRECT_URI: 'https://marketlab.test/api/discussion-auth/callback' };
const path = '/discussion/' + 'a'.repeat(64);
test('email login stays disabled until explicitly enabled with complete HTTPS callback configuration', () => {
  assert.ok(emailConfig(env));
  for (const changed of [{ DISCUSSION_EMAIL_AUTH_ENABLED: 'false' }, { WORKOS_API_KEY: '' }, { WORKOS_CLIENT_ID: 'bad' }, { WORKOS_COOKIE_PASSWORD: 'short' }, { WORKOS_REDIRECT_URI: 'http://marketlab.test/api/discussion-auth/callback' }, { WORKOS_REDIRECT_URI: 'https://marketlab.test/callback' }, { WORKOS_REDIRECT_URI: env.WORKOS_REDIRECT_URI + '?x=1' }]) assert.equal(emailConfig({ ...env, ...changed }), null);
});
test('email return paths cannot leave an invitation or redirect to another site', () => {
  assert.equal(discussionReturnPath(path), path);
  for (const value of [null, '/', '//evil.test', 'https://evil.test', path + '?next=https://evil.test', path + '/..', '/discussion/' + 'A'.repeat(64)]) assert.equal(discussionReturnPath(value), null);
});
test('PKCE callback binds state, browser cookie, password, invitation and ten-minute expiry', async () => {
  const config = emailConfig(env)!, now = Date.now(), first = await beginEmailLogin(config, path, now);
  const url = new URL(first.url), state = url.searchParams.get('state');
  assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, 'api.workos.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(!first.url.includes('a'.repeat(64))); // invitation never sent to provider
  assert.match(first.cookie, /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  const raw = readEmailCookie(first.cookie, EMAIL_FLOW_COOKIE)!;
  const flow = await verifyEmailFlow(raw, state, config.password, now);
  assert.equal(flow?.returnTo, path);
  assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow!.codeVerifier))).toString('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(await verifyEmailFlow(raw, 'wrong-state', config.password, now), null);
  assert.equal(await verifyEmailFlow(null, state, config.password, now), null);
  assert.equal(await verifyEmailFlow(raw, state, config.password + '-other', now), null);
  assert.equal(await verifyEmailFlow(raw, state, config.password, now + 600001), null);
  const parts = raw.split('.'), data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  data.returnTo = '/discussion/' + 'b'.repeat(64);
  assert.equal(await verifyEmailFlow(Buffer.from(JSON.stringify(data)).toString('base64url') + '.' + parts[1], state, config.password, now), null);
  assert.equal(readEmailCookie(`${EMAIL_FLOW_COOKIE}=one; ${EMAIL_FLOW_COOKIE}=two`, EMAIL_FLOW_COOKIE), null);
});
