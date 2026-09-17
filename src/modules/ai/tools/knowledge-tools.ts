/**
 * AETHER AI — Knowledge & Document Tools
 * Authoritative tool definitions for knowledge base, document, and note operations.
 * Connects to real database repositories with validation, verification, and safety boundaries.
 */

import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { DocumentsRepository } from '../../knowledge/documents/documents.repository.js';
import { NotesRepository } from '../../knowledge/notes/notes/notes.repository.js';
import { db } from '../../../database/client.js';

const documentsRepo = new DocumentsRepository();
const notesRepo = new NotesRepository();

// ─── Search Knowledge Tool ───────────────────────────────────────────────────

export interface SearchKnowledgeInput extends Record<string, unknown> {
  readonly query: string;
  readonly collectionId?: string;
  readonly topK?: number;
  readonly scoreThreshold?: number;
}

export interface KnowledgeResult {
  readonly documentId: string;
  readonly chunkId: string;
  readonly content: string;
  readonly score: number;
  readonly title?: string;
  readonly source?: string;
}

export interface SearchKnowledgeOutput {
  readonly results: readonly KnowledgeResult[];
  readonly totalFound: number;
  readonly query: string;
}

export const searchKnowledgeTool: ToolDefinition<SearchKnowledgeInput, SearchKnowledgeOutput> = {
  id: 'tool_search_knowledge',
  name: 'search_knowledge',
  description:
    'Searches the knowledge base, documents, and notes for text matching a query.',
  category: 'knowledge',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text', minLength: 1, maxLength: 2000 },
      collectionId: { type: 'string', description: 'Optional collection ID' },
      topK: { type: 'integer', description: 'Maximum results to return', minimum: 1, maximum: 50 },
      scoreThreshold: {
        type: 'number',
        description: 'Minimum relevance score (0-1)',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['query'],
  },
  requiredPermissions: ['knowledge:read'],
  retryable: true,
  handler: async (
    input: SearchKnowledgeInput,
    _context: ToolExecutionContext,
  ): Promise<SearchKnowledgeOutput> => {
    const q = input.query.toLowerCase().trim();
    const limit = input.topK || 10;
    const threshold = input.scoreThreshold ?? 0.1;

    // Search real documents and notes in database
    const [docs, notes] = await Promise.all([
      db.document.findMany({
        where: {
          OR: [
            { fileName: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: limit,
      }),
      db.note.findMany({
        where: {
          deletedAt: null,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: limit,
      }),
    ]);

    const results: KnowledgeResult[] = [];

    for (const doc of docs) {
      let content = doc.content || '';
      try {
        const parsed = JSON.parse(doc.content || '{}');
        content = parsed.description || parsed.title || doc.content || '';
      } catch {}

      const docTitle = doc.fileName || 'Untitled Document';
      const score = docTitle.toLowerCase().includes(q) ? 0.95 : 0.75;
      if (score >= threshold) {
        results.push({
          documentId: doc.id,
          chunkId: `chunk_${doc.id}_0`,
          title: docTitle,
          content: content.slice(0, 500),
          score,
          source: 'document',
        });
      }
    }

    for (const note of notes) {
      const score = note.title.toLowerCase().includes(q) ? 0.9 : 0.7;
      if (score >= threshold) {
        results.push({
          documentId: note.id,
          chunkId: `chunk_${note.id}_0`,
          title: note.title,
          content: (note.content || '').slice(0, 500),
          score,
          source: 'note',
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const finalResults = results.slice(0, limit);

    return {
      results: finalResults,
      totalFound: finalResults.length,
      query: input.query,
    };
  },
};

// ─── Add Knowledge Document Tool ─────────────────────────────────────────────

export interface AddKnowledgeDocumentInput extends Record<string, unknown> {
  readonly title: string;
  readonly content: string;
  readonly collectionId?: string;
  readonly tags?: readonly string[];
}

export interface AddKnowledgeDocumentOutput {
  readonly documentId: string;
  readonly title: string;
  readonly collectionId: string;
  readonly indexedAt: string;
}

export const addKnowledgeDocumentTool: ToolDefinition<
  AddKnowledgeDocumentInput,
  AddKnowledgeDocumentOutput
> = {
  id: 'tool_add_knowledge_document',
  name: 'add_knowledge_document',
  description: 'Adds a document to the workspace knowledge base.',
  category: 'knowledge',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Document title', minLength: 1, maxLength: 500 },
      content: { type: 'string', description: 'Document content', minLength: 1 },
      collectionId: { type: 'string', description: 'Target collection ID' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Document tags' },
    },
    required: ['title', 'content'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (
    input: AddKnowledgeDocumentInput,
    context: ToolExecutionContext,
  ): Promise<AddKnowledgeDocumentOutput> => {
    const userId = context.auth.userId;
    const doc = await documentsRepo.create({
      title: input.title,
      description: input.content,
      status: 'READY' as any,
      category: 'General',
      tags: (input.tags as string[]) || [],
      fileKey: '',
      metadata: {
        fileSize: Buffer.byteLength(input.content, 'utf8'),
        mimeType: 'text/plain',
        originalName: input.title,
      },
      ownerId: userId,
      sharedUserIds: [],
      permissions: { canRead: [userId], canWrite: [userId] },
    });

    return {
      documentId: doc.id,
      title: doc.title,
      collectionId: input.collectionId ?? 'default',
      indexedAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    };
  },
  verify: async (
    output: AddKnowledgeDocumentOutput,
    input: AddKnowledgeDocumentInput,
  ): Promise<ToolVerificationResult> => {
    const found = await documentsRepo.findById(output.documentId);
    if (!found) {
      return {
        verified: false,
        error: `Document "${output.documentId}" was not found in the database.`,
      };
    }
    if (found.title !== input.title) {
      return {
        verified: false,
        error: `Document title mismatch: expected "${input.title}", found "${found.title}".`,
      };
    }
    return {
      verified: true,
      details: `Document "${found.title}" (ID: ${found.id}) verified in database.`,
      verifiedObject: found,
    };
  },
};

// ─── Delete Knowledge Document Tool ──────────────────────────────────────────

export interface DeleteKnowledgeDocumentInput extends Record<string, unknown> {
  readonly documentId: string;
}

export interface DeleteKnowledgeDocumentOutput {
  readonly documentId: string;
  readonly deleted: boolean;
}

export const deleteKnowledgeDocumentTool: ToolDefinition<
  DeleteKnowledgeDocumentInput,
  DeleteKnowledgeDocumentOutput
> = {
  id: 'tool_delete_knowledge_document',
  name: 'delete_knowledge_document',
  description: 'Permanently deletes a document from the knowledge base. Requires user confirmation.',
  category: 'knowledge',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'The document ID to delete' },
    },
    required: ['documentId'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (
    input: DeleteKnowledgeDocumentInput,
    _context: ToolExecutionContext,
  ): Promise<DeleteKnowledgeDocumentOutput> => {
    const doc = await documentsRepo.findById(input.documentId);
    if (!doc) {
      throw new Error(`Document "${input.documentId}" not found.`);
    }
    const deleted = await documentsRepo.delete(input.documentId);
    return {
      documentId: input.documentId,
      deleted,
    };
  },
  verify: async (output: DeleteKnowledgeDocumentOutput): Promise<ToolVerificationResult> => {
    const doc = await documentsRepo.findById(output.documentId);
    if (doc !== null) {
      return {
        verified: false,
        error: `Document "${output.documentId}" still exists after deletion.`,
      };
    }
    return {
      verified: true,
      details: `Document "${output.documentId}" verified as deleted from database.`,
    };
  },
};

// ─── Get Document Tool ───────────────────────────────────────────────────────

export interface GetDocumentInput extends Record<string, unknown> {
  readonly documentId: string;
}

export interface DocumentDetails {
  readonly documentId: string;
  readonly title: string;
  readonly description?: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly status: string;
  readonly createdAt: string;
}

export const getDocumentTool: ToolDefinition<GetDocumentInput, DocumentDetails> = {
  id: 'tool_get_document',
  name: 'get_document',
  description: 'Retrieves metadata and content for a specific document by ID.',
  category: 'knowledge',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'Unique document identifier' },
    },
    required: ['documentId'],
  },
  requiredPermissions: ['knowledge:read'],
  retryable: true,
  handler: async (input: GetDocumentInput, _context: ToolExecutionContext): Promise<DocumentDetails> => {
    const doc = await documentsRepo.findById(input.documentId);
    if (!doc) {
      throw new Error(`Document "${input.documentId}" not found.`);
    }
    return {
      documentId: doc.id,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      tags: doc.tags,
      status: doc.status,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    };
  },
};

// ─── List Documents Tool ─────────────────────────────────────────────────────

export interface ListDocumentsInput extends Record<string, unknown> {
  readonly limit?: number;
  readonly category?: string;
}

export interface ListDocumentsOutput {
  readonly documents: readonly DocumentDetails[];
  readonly total: number;
}

export const listDocumentsTool: ToolDefinition<ListDocumentsInput, ListDocumentsOutput> = {
  id: 'tool_list_documents',
  name: 'list_documents',
  description: 'Lists documents in the workspace knowledge repository.',
  category: 'knowledge',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Max documents to return', minimum: 1, maximum: 100 },
      category: { type: 'string', description: 'Filter by category' },
    },
  },
  requiredPermissions: ['knowledge:read'],
  retryable: true,
  handler: async (
    input: ListDocumentsInput,
    context: ToolExecutionContext,
  ): Promise<ListDocumentsOutput> => {
    const userId = context.auth.userId;
    const res = await documentsRepo.findAll(
      { limit: input.limit || 20, category: input.category },
      userId,
    );
    const docs: DocumentDetails[] = res.data.map((d) => ({
      documentId: d.id,
      title: d.title,
      description: d.description,
      category: d.category,
      tags: d.tags,
      status: d.status,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
    }));
    return { documents: docs, total: res.total };
  },
};

// ─── Create Note Tool ────────────────────────────────────────────────────────

export interface CreateNoteInput extends Record<string, unknown> {
  readonly title: string;
  readonly content?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
}

export interface CreateNoteOutput {
  readonly noteId: string;
  readonly title: string;
  readonly createdAt: string;
}

export const createNoteTool: ToolDefinition<CreateNoteInput, CreateNoteOutput> = {
  id: 'tool_create_note',
  name: 'create_note',
  description: 'Creates a new note page in the user workspace.',
  category: 'knowledge',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Note title', minLength: 1, maxLength: 300 },
      content: { type: 'string', description: 'Note content' },
      category: { type: 'string', description: 'Category' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
    },
    required: ['title'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (
    input: CreateNoteInput,
    context: ToolExecutionContext,
  ): Promise<CreateNoteOutput> => {
    const userId = context.auth.userId;
    const created = await notesRepo.create(userId, {
      title: input.title,
      content: input.content || '',
      category: input.category || 'General',
      tags: (input.tags as string[]) || [],
      isPinned: false,
      isFavorite: false,
      isArchived: false,
      isQuickNote: true,
      notebookId: null,
      sectionId: null,
      order: 0,
      sharedWithUserIds: [],
      attachmentIds: [],
    });

    return {
      noteId: created.id,
      title: created.title,
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
    };
  },
  verify: async (
    output: CreateNoteOutput,
    input: CreateNoteInput,
    context?: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = context?.auth.userId || '';
    const saved = await notesRepo.findById(output.noteId, userId);
    if (!saved) {
      return { verified: false, error: `Note "${output.noteId}" could not be retrieved from database.` };
    }
    if (saved.title !== input.title) {
      return { verified: false, error: `Note title mismatch in database.` };
    }
    return {
      verified: true,
      details: `Note "${saved.title}" (ID: ${saved.id}) verified in database.`,
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
  description: 'Deletes a note page from the workspace. Requires confirmation.',
  category: 'knowledge',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string', description: 'The unique ID of the note to delete' },
    },
    required: ['noteId'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (
    input: DeleteNoteInput,
    context: ToolExecutionContext,
  ): Promise<DeleteNoteOutput> => {
    const userId = context.auth.userId;
    const note = await notesRepo.findById(input.noteId, userId);
    if (!note) {
      throw new Error(`Note "${input.noteId}" not found.`);
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
    context?: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = context?.auth.userId || '';
    const note = await notesRepo.findById(output.noteId, userId);
    if (note !== null) {
      return { verified: false, error: `Note "${output.noteId}" still exists after deletion.` };
    }
    return {
      verified: true,
      details: `Note "${output.noteId}" verified as deleted from database.`,
    };
  },
};

// ─── All Knowledge Tools ─────────────────────────────────────────────────────

export const knowledgeTools = [
  searchKnowledgeTool,
  addKnowledgeDocumentTool,
  deleteKnowledgeDocumentTool,
  getDocumentTool,
  listDocumentsTool,
  createNoteTool,
  deleteNoteTool,
] as const;

// Auto-register tools on load
for (const tool of knowledgeTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
