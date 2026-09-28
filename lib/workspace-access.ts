export class WorkspaceAccessError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

/** Production identity comes only from the Sites dispatcher's verified headers. */
export function workspaceOwner(userId: string | null, development = false) {
  if (development && !userId) return 'local-preview';
  if (!userId) throw new WorkspaceAccessError('Sign in to open your saved workspace.', 401);
  return userId;
}
