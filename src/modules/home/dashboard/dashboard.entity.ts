export interface DashboardStatsEntity {
  totalProjects: number;
  totalConversations: number;
  totalDocuments: number;
  unreadNotifications: number;
}

export interface DashboardEntity {
  stats: DashboardStatsEntity;
  greeting: string;
  userId: string;
  workspaceId: string;
}