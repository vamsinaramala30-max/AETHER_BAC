export interface IProject {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}