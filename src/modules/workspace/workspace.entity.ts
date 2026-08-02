export class WorkspaceEntity {
  declare id: string;
  declare name: string;
  declare slug: string;
  declare ownerId: string;
  description?: string | null;
  avatarUrl?: string | null;
  declare isArchived: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;

  constructor(partial: Partial<WorkspaceEntity>) {
    Object.assign(this, partial);
  }
}

export class WorkspaceMemberEntity {
  declare id: string;
  declare workspaceId: string;
  declare userId: string;
  declare role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  declare joinedAt: Date;

  constructor(partial: Partial<WorkspaceMemberEntity>) {
    Object.assign(this, partial);
  }
}

export class WorkspaceOverviewEntity {
  declare workspaceId: string;
  declare totalMembers: number;
  declare activeFocusSessionsCount: number;
  declare upcomingEventsCount: number;
  declare recentFilesCount: number;
  declare favoritesCount: number;
  declare generatedAt: Date;

  constructor(partial: Partial<WorkspaceOverviewEntity>) {
    Object.assign(this, partial);
  }
}
