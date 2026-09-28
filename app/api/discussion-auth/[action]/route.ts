import { env } from 'cloudflare:workers';
import { chatGPTSignInPath } from '@/app/chatgpt-auth';
import { database, publicSharingEnabled, HttpError, json } from '@/lib/server';
import { invitationAvailable } from '@/lib/research-discussion';
import { beginEmailLogin, clearFlowCookie, clearSessionCookie, discussionReturnPath, emailClient, emailConfig,
  EMAIL_FLOW_COOKIE, EMAIL_SESSION_COOKIE, readEmailCookie, readEmailSession, sessionCookie, verifyEmailFlow } from '@/lib/discussion-email';

type Context = { params: Promise<{ action: string }> };
function redirectTo(path: string, cookies: string[] = []) {
  const headers = new Headers({ Location: path, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}
async function validInvitation(path: string) {
  if (!await invitationAvailable(database(), path.slice('/discussion/'.length))) throw new HttpError('This invitation is unavailable.', 404);
}
export async function GET(request: Request, { params }: Context) {
  const { action } = await params, url = new URL(request.url), config = emailConfig(env);
  if (!publicSharingEnabled() || !config) return json({ error: 'Email sign-in is not available.' }, 404);
  try {
    if (action === 'callback') {
      const flow = await verifyEmailFlow(readEmailCookie(request.headers.get('cookie'), EMAIL_FLOW_COOKIE), url.searchParams.get('state'), config.password);
      if (!flow) return json({ error: 'This sign-in attempt expired. Open your invitation and try again.' }, 400);
      const failurePath = `${flow.returnTo}?email_error=1`;
      const code = url.searchParams.get('code');
      if (!code || code.length > 2048 || url.searchParams.has('error')) return redirectTo(failurePath, [clearFlowCookie()]);
      let phase = 'invitation';
      try {
        await validInvitation(flow.returnTo);
        phase = 'code-exchange';
        const response = await emailClient(config).userManagement.authenticateWithCode({
          code, codeVerifier: flow.codeVerifier, clientId: config.clientId,
          session: { sealSession: true, cookiePassword: config.password },
        });
        if (!response.sealedSession) throw new Error('Missing session');
        phase = 'session-validation';
        const session = await readEmailSession(config, response.sealedSession);
        if (!session.user) {
          // Only a closed application-defined label is logged, never a token,
          // decoded claim, cookie, email address or upstream response body.
          console.warn(`Discussion email callback rejected session: ${session.rejection ?? 'unavailable'}.`);
          return redirectTo(failurePath, [clearFlowCookie()]);
        }
        console.info('Discussion email callback established a verified session.');
        return redirectTo(flow.returnTo, [clearFlowCookie(), sessionCookie(response.sealedSession)]);
      } catch {
        console.warn(`Discussion email callback failed at ${phase}.`);
        return redirectTo(failurePath, [clearFlowCookie()]);
      }
    }
    const path = discussionReturnPath(url.searchParams.get('return_to'));
    if (!path) return json({ error: 'Open a report invitation to sign in.' }, 400);
    if (action === 'chatgpt') return redirectTo(chatGPTSignInPath(path), [clearSessionCookie(), clearFlowCookie()]);
    if (action === 'start') {
      await validInvitation(path);
      const flow = await beginEmailLogin(config, path);
      return redirectTo(flow.url, [flow.cookie]);
    }
    if (action === 'refresh') {
      const raw = readEmailCookie(request.headers.get('cookie'), EMAIL_SESSION_COOKIE);
      if (!raw) return redirectTo(path);
      const result = await readEmailSession(config, raw, true);
      return redirectTo(path, result.cookie ? [result.cookie] : []);
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : 'Email sign-in is temporarily unavailable. Please try again.' }, error instanceof HttpError ? error.status : 503);
  }
}
export async function POST(request: Request, { params }: Context) {
  const { action } = await params, config = emailConfig(env), url = new URL(request.url);
  if (action !== 'logout' || !config || !publicSharingEnabled()) return json({ error: 'Not found.' }, 404);
  // Browser form POSTs supply Origin; fail closed if absent or cross-origin.
  if (request.headers.get('origin') !== new URL(config.redirectUri).origin) return json({ error: 'Invalid sign-out request.' }, 403);
  const path = discussionReturnPath(url.searchParams.get('return_to'));
  if (!path) return json({ error: 'Invalid discussion.' }, 400);
  try {
    const raw = readEmailCookie(request.headers.get('cookie'), EMAIL_SESSION_COOKIE);
    if (raw) {
      const session = await readEmailSession(config, raw, true);
      if (session.sessionId) await emailClient(config).userManagement.revokeSession({ sessionId: session.sessionId });
    }
    return redirectTo(path, [clearSessionCookie(), clearFlowCookie()]);
  } catch { return json({ error: 'Could not finish signing out. Please try again.' }, 503); }
}
