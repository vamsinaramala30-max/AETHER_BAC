export interface CreateConversationDto {
  userId: string;
  workspaceId?: string;
  title?: string;
}

export interface UpdateConversationDto {
  title?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface QueryConversationDto {
  page?: number;
  limit?: number;
  search?: string;
  isArchived?: boolean;
  isPinned?: boolean;
}
