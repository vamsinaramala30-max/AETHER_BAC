export interface IWorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
}

export interface IWorkspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  members?: IWorkspaceMember[];
  createdAt: Date;
  updatedAt: Date;
}