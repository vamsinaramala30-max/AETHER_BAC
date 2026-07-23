export enum WorkspaceEventType {
  WORKSPACE_CREATED = 'workspace.created',
  WORKSPACE_UPDATED = 'workspace.updated',
  WORKSPACE_DELETED = 'workspace.deleted',
  MEMBER_ADDED = 'workspace.member_added',
  MEMBER_REMOVED = 'workspace.member_removed',
}

export interface WorkspaceCreatedPayload {
  workspaceId: string;
  ownerId: string;
  name: string;
  slug: string;
}

export interface WorkspaceMemberAddedPayload {
  workspaceId: string;
  userId: string;
  role: string;
  addedBy: string;
}