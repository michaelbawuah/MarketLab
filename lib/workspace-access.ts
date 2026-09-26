export class WorkspaceAccessError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Production identity comes only from the Sites dispatcher's verified headers. */
export function workspaceOwner(userId: string | null, email: string | null, allowedEmail: string | undefined, development = false) {
  if (development && !userId) return 'local-preview';
  if (!userId) throw new WorkspaceAccessError('Sign in to open your saved workspace.', 401);
  if (!allowedEmail?.trim()) throw new WorkspaceAccessError('Workspace access is temporarily unavailable.', 503);
  if (!email || email.trim().toLowerCase() !== allowedEmail.trim().toLowerCase()) throw new WorkspaceAccessError('This workspace is private. Open the report link shared with you instead.', 403);
  return userId;
}
