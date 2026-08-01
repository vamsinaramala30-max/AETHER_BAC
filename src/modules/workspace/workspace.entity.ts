export class WorkspaceEntity {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  description?: string | null;
  avatarUrl?: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<WorkspaceEntity>) {
    Object.assign(this, partial);
  }
}

export class WorkspaceMemberEntity {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  joinedAt: Date;

  constructor(partial: Partial<WorkspaceMemberEntity>) {
    Object.assign(this, partial);
  }
}

export class WorkspaceOverviewEntity {
  workspaceId: string;
  totalMembers: number;
  activeFocusSessionsCount: number;
  upcomingEventsCount: number;
  recentFilesCount: number;
  favoritesCount: number;
  generatedAt: Date;

  constructor(partial: Partial<WorkspaceOverviewEntity>) {
    Object.assign(this, partial);
  }
}