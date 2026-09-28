import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { emailConfig, EMAIL_SESSION_COOKIE, readEmailCookie, readEmailSession } from './discussion-email';

export async function discussionIdentity(refresh = false): Promise<{
  user: { userId: string; displayName: string; accountLabel: string; provider: 'email' | 'chatgpt' } | null;
  cookie?: string; needsRefresh?: boolean;
}> {
  const config = emailConfig(env), h = await headers();
  const raw = readEmailCookie(h.get('cookie'), EMAIL_SESSION_COOKIE);
  if (config && raw) return readEmailSession(config, raw, refresh);
  const user = await getChatGPTUser();
  return { user: user ? { userId: user.userId, displayName: user.fullName || 'Invited reader', accountLabel: user.displayName, provider: 'chatgpt' as const } : null };
}
