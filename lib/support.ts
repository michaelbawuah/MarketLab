import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
/** Support access belongs to the original, dispatcher-verified owner account.
 * An unrelated email login with the same display email does not inherit it. */
export async function supportAdmin(owner:string){const h=await headers();return h.get('oai-authenticated-user-id')===owner&&!!env.WORKSPACE_OWNER_EMAIL?.trim()&&h.get('oai-authenticated-user-email')?.trim().toLowerCase()===env.WORKSPACE_OWNER_EMAIL.trim().toLowerCase();}
