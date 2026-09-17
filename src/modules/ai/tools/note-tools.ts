/**
 * AETHER AI — Note Tools
 * Production tools for creating, reading, updating, deleting, and listing notes.
 * Scoped strictly to authenticated user / tenant, verified against real PostgreSQL database.
 */

import crypto from 'node:crypto';
import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { NotesRepository } from '../../knowledge/notes/notes/notes.repository.js';

const notesRepo = new NotesRepository();

function toUuid(id?: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (id && uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(id || 'default-user').digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// ─── Create Note Tool ────────────────────────────────────────────────────────

export interface CreateNoteInput extends Record<string, unknown> {
  readonly title: string;
  readonly content?: string;
  readonly tags?: readonly string[];
  readonly category?: string;
}

export interface CreateNoteOutput {
  readonly noteId: string;
  readonly title: string;
  readonly category: string;
  readonly createdAt: string;
}

export const createNoteTool: ToolDefinition<CreateNoteInput, CreateNoteOutput> = {
  id: 'tool_create_note',
  name: 'create_note',
  description: 'Creates a new note or document in user knowledge base.',
  category: 'knowledge',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title', minLength: 1, maxLength: 500 },
      content: { type: 'string', description: 'Note markdown content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for classification' },
      category: { type: 'string', description: 'Category or folder name' },
    },
    required: ['title'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (
    input: CreateNoteInput,
    context: ToolExecutionContext,
  ): Promise<CreateNoteOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);

    const created = await notesRepo.create(userId, {
      title: input.title,
      content: input.content || '',
      tags: input.tags ? [...input.tags] : [],
      category: input.category || 'General',
      isFavorite: false,
      isPinned: false,
      isArchived: false,
      isQuickNote: false,
      attachmentIds: [],
      sharedWithUserIds: [],
      order: 0,
      notebookId: null,
      sectionId: null,
    });

    return {
      noteId: created.id,
      title: created.title,
      category: created.category,
      createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : new Date().toISOString(),
    };
  },
  verify: async (
    output: CreateNoteOutput,
    input: CreateNoteInput,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = toUuid(context.auth?.userId);
    const saved = await notesRepo.findById(output.noteId, userId);
    if (!saved) {
      return {
        verified: false,
        error: `Note with ID "${output.noteId}" could not be found in database for user.`,
      };
    }
    if (saved.title !== input.title) {
      return {
        verified: false,
        error: `Note title mismatch in database: expected "${input.title}", found "${saved.title}".`,
      };
    }
    return {
      verified: true,
      details: `Note "${saved.title}" (ID: ${saved.id}) verified in database.`,
      verifiedObject: saved,
    };
  },
};

// ─── Get Note Tool ───────────────────────────────────────────────────────────

export interface GetNoteInput extends Record<string, unknown> {
  readonly noteId: string;
}

export interface NoteDetails {
  readonly noteId: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly category: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const getNoteTool: ToolDefinition<GetNoteInput, NoteDetails> = {
  id: 'tool_get_note',
  name: 'get_note',
  description: 'Retrieves an existing note by its unique ID for the authenticated user.',
  category: 'knowledge',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string', description: 'The unique ID of the note' },
    },
    required: ['noteId'],
  },
  requiredPermissions: ['knowledge:read'],
  handler: async (input: GetNoteInput, context: ToolExecutionContext): Promise<NoteDetails> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);
    const note = await notesRepo.findById(input.noteId, userId);
    if (!note) {
      throw new Error(`Note with ID "${input.noteId}" not found.`);
    }

    return {
      noteId: note.id,
      title: note.title,
      content: note.content,
      tags: note.tags,
      category: note.category,
      createdAt: note.createdAt instanceof Date ? note.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: note.updatedAt instanceof Date ? note.updatedAt.toISOString() : new Date().toISOString(),
    };
  },
};

// ─── Update Note Tool ────────────────────────────────────────────────────────

export interface UpdateNoteInput extends Record<string, unknown> {
  readonly noteId: string;
  readonly title?: string;
  readonly content?: string;
  readonly tags?: readonly string[];
  readonly category?: string;
}

export interface UpdateNoteOutput {
  readonly noteId: string;
  readonly title: string;
  readonly updated: boolean;
  readonly updatedAt: string;
}

export const updateNoteTool: ToolDefinition<UpdateNoteInput, UpdateNoteOutput> = {
  id: 'tool_update_note',
  name: 'update_note',
  description: "Updates an existing note's title, content, tags, or category.",
  category: 'knowledge',
  riskLevel: 'MODIFY',
  inputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string', description: 'The ID of the note to update' },
      title: { type: 'string', description: 'New note title' },
      content: { type: 'string', description: 'New markdown content' },
      tags: { type: 'array', items: { type: 'string' }, description: 'New tags' },
      category: { type: 'string', description: 'New category' },
    },
    required: ['noteId'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (
    input: UpdateNoteInput,
    context: ToolExecutionContext,
  ): Promise<UpdateNoteOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);

    const existing = await notesRepo.findById(input.noteId, userId);
    if (!existing) {
      throw new Error(`Note with ID "${input.noteId}" not found.`);
    }

    const updates: any = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.content !== undefined) updates.content = input.content;
    if (input.tags !== undefined) updates.tags = [...input.tags];
    if (input.category !== undefined) updates.category = input.category;

    const updated = await notesRepo.update(input.noteId, userId, updates);
    if (!updated) {
      throw new Error(`Failed to update note "${input.noteId}".`);
    }

    return {
      noteId: updated.id,
      title: updated.title,
      updated: true,
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : new Date().toISOString(),
    };
  },
  verify: async (
    output: UpdateNoteOutput,
    input: UpdateNoteInput,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = toUuid(context.auth?.userId);
    const saved = await notesRepo.findById(output.noteId, userId);
    if (!saved) {
      return { verified: false, error: `Updated note "${output.noteId}" could not be retrieved from database.` };
    }
    if (input.title && saved.title !== input.title) {
      return { verified: false, error: `Note title was not updated in database: expected "${input.title}", found "${saved.title}".` };
    }
    if (input.content && saved.content !== input.content) {
      return { verified: false, error: `Note content was not updated in database.` };
    }
    return {
      verified: true,
      details: `Note "${saved.title}" successfully updated and verified in database.`,
      verifiedObject: saved,
    };
  },
};

// ─── Delete Note Tool ────────────────────────────────────────────────────────

export interface DeleteNoteInput extends Record<string, unknown> {
  readonly noteId: string;
}

export interface DeleteNoteOutput {
  readonly noteId: string;
  readonly deleted: boolean;
}

export const deleteNoteTool: ToolDefinition<DeleteNoteInput, DeleteNoteOutput> = {
  id: 'tool_delete_note',
  name: 'delete_note',
  description: 'Deletes a note from the knowledge base for the authenticated user.',
  category: 'knowledge',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string', description: 'The ID of the note to delete' },
    },
    required: ['noteId'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (
    input: DeleteNoteInput,
    context: ToolExecutionContext,
  ): Promise<DeleteNoteOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);

    const existing = await notesRepo.findById(input.noteId, userId);
    if (!existing) {
      throw new Error(`Note with ID "${input.noteId}" not found.`);
    }

    const deleted = await notesRepo.delete(input.noteId, userId);
    return {
      noteId: input.noteId,
      deleted,
    };
  },
  verify: async (
    output: DeleteNoteOutput,
    _input: DeleteNoteInput,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = toUuid(context.auth?.userId);
    const existing = await notesRepo.findById(output.noteId, userId);
    if (existing !== null && existing !== undefined) {
      return {
        verified: false,
        error: `Note "${output.noteId}" still exists in database after deletion.`,
      };
    }
    return {
      verified: true,
      details: `Note "${output.noteId}" verified as deleted from database.`,
    };
  },
};

// ─── List Notes Tool ─────────────────────────────────────────────────────────

export interface ListNotesInput extends Record<string, unknown> {
  readonly search?: string;
  readonly limit?: number;
}

export interface NoteSummary {
  readonly noteId: string;
  readonly title: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly updatedAt: string;
}

export interface ListNotesOutput {
  readonly notes: readonly NoteSummary[];
  readonly total: number;
}

export const listNotesTool: ToolDefinition<ListNotesInput, ListNotesOutput> = {
  id: 'tool_list_notes',
  name: 'list_notes',
  description: 'Lists notes for the authenticated user, optionally searching by title or content.',
  category: 'knowledge',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Search term for title or content' },
      limit: { type: 'integer', description: 'Maximum notes to return', minimum: 1, maximum: 100 },
    },
  },
  requiredPermissions: ['knowledge:read'],
  handler: async (
    input: ListNotesInput,
    context: ToolExecutionContext,
  ): Promise<ListNotesOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);

    const res = await notesRepo.findAll(userId, {
      search: input.search,
      limit: input.limit || 20,
    });

    const summaries: NoteSummary[] = res.data.map((n) => ({
      noteId: n.id,
      title: n.title,
      category: n.category,
      tags: n.tags,
      updatedAt: n.updatedAt instanceof Date ? n.updatedAt.toISOString() : new Date().toISOString(),
    }));

    return {
      notes: summaries,
      total: res.total,
    };
  },
};

// ─── Export All Note Tools ───────────────────────────────────────────────────

export const noteTools = [
  createNoteTool,
  getNoteTool,
  updateNoteTool,
  deleteNoteTool,
  listNotesTool,
] as const;

for (const tool of noteTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
