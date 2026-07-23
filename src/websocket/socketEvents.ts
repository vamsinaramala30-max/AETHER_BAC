export const SOCKET_ROOMS = {
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
  project: (projectId: string) => `project:${projectId}`,
  user: (userId: string) => `user:${userId}`,
};