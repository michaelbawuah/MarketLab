import { WorkOS } from '@workos-inc/node/worker';

export const EMAIL_SESSION_COOKIE = '__Host-marketlab-discussion';
export const EMAIL_FLOW_COOKIE = '__Host-marketlab-email-flow';
export const EMAIL_CALLBACK = '/api/discussion-auth/callback';
const FLOW_SECONDS = 600;
export type EmailConfig = { apiKey: string; clientId: string; password: string; redirectUri: string };
type EmailEnvironment = {
  DISCUSSION_EMAIL_AUTH_ENABLED?: string; WORKOS_API_KEY?: string; WORKOS_CLIENT_ID?: string;
  WORKOS_COOKIE_PASSWORD?: string; WORKOS_REDIRECT_URI?: string;
};
export function emailConfig(env: EmailEnvironment): EmailConfig | null {
  if (env.DISCUSSION_EMAIL_AUTH_ENABLED !== 'true' || !env.WORKOS_API_KEY ||
      !/^client_[A-Za-z0-9]+$/.test(env.WORKOS_CLIENT_ID ?? '') || (env.WORKOS_COOKIE_PASSWORD?.length ?? 0) < 32) return null;
  try {
    const uri = new URL(env.WORKOS_REDIRECT_URI ?? '');
    if (uri.protocol !== 'https:' || uri.username || uri.password || uri.search || uri.hash || uri.pathname !== EMAIL_CALLBACK) return null;
    return { apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID!, password: env.WORKOS_COOKIE_PASSWORD!, redirectUri: uri.href };
  } catch { return null; }
}
export function discussionReturnPath(value: string | null): string | null {
  return value && /^\/discussion\/[a-f0-9]{64}$/.test(value) ? value : null;
}
export function emailCookie(name: typeof EMAIL_SESSION_COOKIE | typeof EMAIL_FLOW_COOKIE, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export const sessionCookie = (value: string) => emailCookie(EMAIL_SESSION_COOKIE, value, 7 * 24 * 60 * 60);
export const clearSessionCookie = () => emailCookie(EMAIL_SESSION_COOKIE, '', 0);
export const clearFlowCookie = () => emailCookie(EMAIL_FLOW_COOKIE, '', 0);
export function readEmailCookie(header: string | null, name: string): string | null {
  const values = (header ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  if (values.length !== 1 || values[0].length > 12000) return null;
  try { return decodeURIComponent(values[0].slice(name.length + 1)) || null; } catch { return null; }
}
export function emailClient(config: EmailConfig) {
  // The Worker entrypoint forwards config to FetchHttpClient. Its timeout is
  // implemented there, but absent from the SDK's RequestInit declaration.
  const requestConfig: RequestInit & { timeout: number } = { timeout: 10000 };
  return new WorkOS(config.apiKey, { clientId: config.clientId, maxRetries: 0, config: requestConfig });
}
type Flow = { state: string; codeVerifier: string; returnTo: string; expires: number };
const encode = (value: Uint8Array) => Buffer.from(value).toString('base64url');
async function flowKey(password: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(`marketlab-email-flow:${password}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
// The provider receives a random state only, never a report invitation token.
// The verifier and return path stay in a host-only, HttpOnly, signed cookie.
export async function beginEmailLogin(config: EmailConfig, returnTo: string, now = Date.now()) {
  if (!discussionReturnPath(returnTo)) throw new Error('Invalid discussion path');
  const { url, state, codeVerifier } = await emailClient(config).userManagement.getAuthorizationUrlWithPKCE({
    provider: 'authkit', redirectUri: config.redirectUri, screenHint: 'sign-in', prompt: 'login',
  });
  const flow: Flow = { state, codeVerifier, returnTo, expires: now + FLOW_SECONDS * 1000 };
  const payload = encode(new TextEncoder().encode(JSON.stringify(flow)));
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await flowKey(config.password), new TextEncoder().encode(payload))));
  return { url, cookie: emailCookie(EMAIL_FLOW_COOKIE, `${payload}.${signature}`, FLOW_SECONDS) };
}
export async function verifyEmailFlow(raw: string | null, state: string | null, password: string, now = Date.now()): Promise<Flow | null> {
  if (!raw || raw.length > 3000 || !state || state.length > 256) return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
  try {
    if (!await crypto.subtle.verify('HMAC', await flowKey(password), Buffer.from(parts[1], 'base64url'), new TextEncoder().encode(parts[0]))) return null;
    const flow = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Flow;
    if (flow.state !== state || !discussionReturnPath(flow.returnTo) || typeof flow.codeVerifier !== 'string' ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(flow.codeVerifier) || !Number.isSafeInteger(flow.expires) ||
        flow.expires <= now || flow.expires > now + FLOW_SECONDS * 1000) return null;
    return flow;
  } catch { return null; }
}
export type EmailViewer = { userId: string; displayName: string; accountLabel: string; provider: 'email' };
type EmailRejection = 'invalid_jwt' | 'invalid_session' | 'refresh_failed' | 'email_unverified' | 'impersonation' | 'issuer_mismatch' | 'subject_mismatch' | 'client_mismatch' | 'audience_mismatch';
type EmailSession = { user: EmailViewer | null; needsRefresh?: boolean; cookie?: string; sessionId?: string; rejection?: EmailRejection };
// Retain the two legacy issuers documented in WorkOS's session guides. Current
// OIDC discovery uses /user_management/<clientId>; derive that exact value only
// from trusted configuration, never from token-controlled URLs or prefixes.
const LEGACY_WORKOS_SESSION_ISSUERS = new Set(['https://api.workos.com', 'https://api.workos.com/']);
export async function readEmailSession(config: EmailConfig, raw: string, refresh = false): Promise<EmailSession> {
  const session = emailClient(config).userManagement.loadSealedSession({ sessionData: raw, cookiePassword: config.password });
  const rejected = (rejection: EmailRejection): EmailSession => ({ user: null, cookie: clearSessionCookie(), rejection });
  try {
    let result = await session.authenticate();
    let cookie: string | undefined;
    if (!result.authenticated && result.reason === 'invalid_jwt') {
      if (!refresh) return { user: null, needsRefresh: true, rejection: 'invalid_jwt' };
      const renewed = await session.refresh();
      if (!renewed.authenticated) {
        // A transient outage must not silently discard a still-refreshable session.
        if (renewed.retryable) throw new Error('Email sign-in is temporarily unavailable');
        return rejected('refresh_failed');
      }
      if (!renewed.sealedSession) return rejected('refresh_failed');
      cookie = sessionCookie(renewed.sealedSession);
      result = await session.authenticate();
    }
    if (!result.authenticated) return rejected('invalid_session');
    const { user, accessToken, sessionId } = result;
    // SDK verifies the signature/expiry; also bind the signed identity and issuer
    // to the encrypted profile, and require verified email with no impersonation.
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8')) as { iss?: string; sub?: string; client_id?: string; aud?: string | string[] };
    if (!user.emailVerified) return rejected('email_unverified');
    if (result.impersonator) return rejected('impersonation');
    if (claims.iss !== `https://api.workos.com/user_management/${config.clientId}` &&
        !LEGACY_WORKOS_SESSION_ISSUERS.has(claims.iss ?? '')) return rejected('issuer_mismatch');
    if (claims.sub !== user.id) return rejected('subject_mismatch');
    if (claims.client_id !== undefined && claims.client_id !== config.clientId) return rejected('client_mismatch');
    if (claims.aud !== undefined && !(Array.isArray(claims.aud) ? claims.aud.includes(config.clientId) : claims.aud === config.clientId)) {
      return rejected('audience_mismatch');
    }
    return { user: { userId: `workos:${config.clientId}:${user.id}`, provider: 'email',
      displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Invited reader',
      accountLabel: user.email }, cookie, sessionId };
  } catch {
    // Never log upstream bodies, cookies, tokens or email addresses.
    console.warn('Discussion email session validation or refresh failed.');
    throw new Error('Email sign-in is temporarily unavailable');
  }
}
