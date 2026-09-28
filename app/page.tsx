import Dashboard from './workspace';
import { initialWorkspace } from '@/lib/finance/demo';
import { workspaceAccount, publicSharingEnabled } from '@/lib/server';
import { emailConfig } from '@/lib/discussion-email';
import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import Welcome from './welcome';
export const dynamic = 'force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{email_error?:string}>}) {
  const params=await searchParams;
  let account;
  try { account=await workspaceAccount(); }
  catch { return <Welcome status={503} sharing={publicSharingEnabled()} emailEnabled={!!emailConfig(env)}/>; }
  if(account.needsRefresh)redirect('/api/discussion-auth/refresh?return_to=%2F');
  if(!account.user)return <Welcome status={401} sharing={publicSharingEnabled()} emailEnabled={!!emailConfig(env)} emailError={params.email_error==='1'}/>;
  return <Dashboard initial={initialWorkspace()} account={{label:account.user.accountLabel,email:account.user.provider==='email'}}/>;
}
