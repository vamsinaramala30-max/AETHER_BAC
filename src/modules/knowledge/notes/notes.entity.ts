export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  title: string;
  versionNumber: number;
  createdAt: Date;
  createdBy: string;
}

export interface NoteEntity {
  id: string;
  title: string;
  content: string;
  formattedContent?: string; // Rich Text / HTML / Markdown
  tags: string[];
  category: string;
  isFavorite: boolean;
  isArchived: boolean;
  isPinned: boolean;
  sharedWithUserIds: string[];
  attachmentIds: string[];
  version: number;
  aiSummary?: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
}
