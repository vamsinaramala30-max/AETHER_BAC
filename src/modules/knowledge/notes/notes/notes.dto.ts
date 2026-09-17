import { NotesAiAction } from '../ai/notes-ai.client';

export class CreateNoteDto {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  isPinned?: boolean;
  notebookId?: string; // omit + isQuickNote for a Quick Note
  sectionId?: string;
  isQuickNote?: boolean;
}

export class UpdateNoteDto {
  title?: string;
  content?: string;
  formattedContent?: string;
  category?: string;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  order?: number;
  sharedWithUserIds?: string[];
  attachmentIds?: string[];
}

export class MoveNoteDto {
  notebookId!: string;
  sectionId!: string;
}

export class ReorderNotesDto {
  sectionId!: string;
  orderedIds!: string[];
}

export class QueryNotesDto {
  page?: number;
  limit?: number;
  category?: string;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  notebookId?: string;
  sectionId?: string;
  isQuickNote?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'order';
  sortOrder?: 'asc' | 'desc';
}

export class AiProcessNoteDto {
  action!: NotesAiAction;
  question?: string; // required when action === 'ASK'
}
