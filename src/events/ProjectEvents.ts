export enum ProjectEventType {
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_DELETED = 'project.deleted',
}

export interface ProjectCreatedPayload {
  projectId: string;
  workspaceId: string;
  name: string;
  createdAt: Date;
}

export interface ProjectUpdatedPayload {
  projectId: string;
  workspaceId: string;
  updatedFields: string[];
}