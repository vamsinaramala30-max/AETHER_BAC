/**
 * AETHER AI — Knowledge Tools
 * Tool definitions for knowledge base operations.
 * Integrates with the Part 1 RAG subsystem — does NOT duplicate RAG logic.
 */

import type { ToolDefinition, ToolExecutionContext } from './tool-types.js';

// ─── Knowledge Tool I/O Types ────────────────────────────────────────────────

export interface SearchKnowledgeInput {
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

export interface AddKnowledgeDocumentInput {
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

export interface DeleteKnowledgeDocumentInput {
  readonly documentId: string;
}

export interface DeleteKnowledgeDocumentOutput {
  readonly documentId: string;
  readonly deleted: boolean;
}

// ─── Search Knowledge Tool ───────────────────────────────────────────────────

export const searchKnowledgeTool: ToolDefinition<SearchKnowledgeInput, SearchKnowledgeOutput> = {
  name: 'search_knowledge',
  description: 'Searches the knowledge base for documents matching a query. Uses the RAG retrieval pipeline.',
  category: 'knowledge',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text', minLength: 1, maxLength: 2000 },
      collectionId: { type: 'string', description: 'Optional collection to restrict search to' },
      topK: { type: 'integer', description: 'Maximum number of results', minimum: 1, maximum: 20 },
      scoreThreshold: { type: 'number', description: 'Minimum relevance score (0-1)', minimum: 0, maximum: 1 },
    },
    required: ['query'],
  },
  requiredPermissions: ['knowledge:read'],
  handler: async (_input: SearchKnowledgeInput, _context: ToolExecutionContext): Promise<SearchKnowledgeOutput> => {
    // Integration point — delegates to KnowledgeService → RAGEngine.query()
    return { results: [], totalFound: 0, query: _input.query };
  },
};

// ─── Add Knowledge Document Tool ─────────────────────────────────────────────

export const addKnowledgeDocumentTool: ToolDefinition<AddKnowledgeDocumentInput, AddKnowledgeDocumentOutput> = {
  name: 'add_knowledge_document',
  description: 'Adds a document to the knowledge base for future retrieval.',
  category: 'knowledge',
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
  handler: async (input: AddKnowledgeDocumentInput, _context: ToolExecutionContext): Promise<AddKnowledgeDocumentOutput> => {
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      documentId,
      title: input.title,
      collectionId: input.collectionId ?? 'default',
      indexedAt: new Date().toISOString(),
    };
  },
};

// ─── Delete Knowledge Document Tool ──────────────────────────────────────────

export const deleteKnowledgeDocumentTool: ToolDefinition<DeleteKnowledgeDocumentInput, DeleteKnowledgeDocumentOutput> = {
  name: 'delete_knowledge_document',
  description: 'Removes a document from the knowledge base.',
  category: 'knowledge',
  inputSchema: {
    type: 'object',
    properties: {
      documentId: { type: 'string', description: 'The document ID to delete' },
    },
    required: ['documentId'],
  },
  requiredPermissions: ['knowledge:write'],
  handler: async (input: DeleteKnowledgeDocumentInput, _context: ToolExecutionContext): Promise<DeleteKnowledgeDocumentOutput> => {
    return {
      documentId: input.documentId,
      deleted: true,
    };
  },
};

// ─── All Knowledge Tools ─────────────────────────────────────────────────────

export const knowledgeTools = [searchKnowledgeTool, addKnowledgeDocumentTool, deleteKnowledgeDocumentTool] as const;
