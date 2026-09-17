export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  title: string;
  versionNumber: number;
  createdAt: Date;
  createdBy: string;
}

/**
 * A "Page" in the OneNote-style hierarchy. This is the same entity the app
 * previously called a flat "Note" — kept the same table/name to avoid a
 * data migration for the note content itself (see
 * ../migrations/002_backfill_default_notebook.ts for how existing rows get
 * notebookId/sectionId populated).
 */
export interface NoteEntity {
  id: string;
  title: string;
  content: string;
  formattedContent?: string; // Rich Text / HTML produced by the page editor
  tags: string[];
  category: string;
  notebookId: string | null; // null only for Quick Notes not yet filed
  sectionId: string | null;
  order: number;
  isFavorite: boolean;
  isArchived: boolean;
  isPinned: boolean;
  isQuickNote: boolean;
  sharedWithUserIds: string[];
  attachmentIds: string[];
  version: number;
  aiSummary?: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
}
