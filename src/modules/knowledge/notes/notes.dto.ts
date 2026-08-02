export class CreateNoteDto {
  title!: string;
  content!: string;
  category?: string;
  tags?: string[];
  isPinned?: boolean;
}

export class UpdateNoteDto {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  sharedWithUserIds?: string[];
  attachmentIds?: string[];
}

export class QueryNotesDto {
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export class AiProcessNoteDto {
  action!: 'SUMMARIZE' | 'REWRITE' | 'EXTRACT_TAGS';
  targetLength?: 'SHORT' | 'MEDIUM' | 'DETAILED';
  tone?: 'PROFESSIONAL' | 'CASUAL' | 'TECHNICAL';
}
