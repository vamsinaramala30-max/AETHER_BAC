/**
 * AETHER AI — Memory Tools
 * Production tools for persistent long-term AI memory operations.
 * Tenant-scoped, backed by PostgreSQL (ai_memories table) + memoryRepository, with real DB verification.
 */

import crypto from 'node:crypto';
import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import type { MemoryItem, MemoryType, MemoryScope } from '../ai-types.js';
import { toolRegistry } from './tool-registry.js';
import { memoryRepository, toUuid } from '../storage/repositories/memory-repository.js';

// ─── Store Memory Tool ───────────────────────────────────────────────────────

export interface StoreMemoryInput extends Record<string, unknown> {
  readonly content: string;
  readonly type?: 'fact' | 'preference' | 'summary' | 'workspace' | 'project';
  readonly importance?: number;
  readonly scope?: 'GLOBAL_USER' | 'WORKSPACE' | 'PROJECT';
}

export interface StoreMemoryOutput {
  readonly memoryId: string;
  readonly content: string;
  readonly type: string;
  readonly importance: number;
  readonly storedAt: string;
}

export const storeMemoryTool: ToolDefinition<StoreMemoryInput, StoreMemoryOutput> = {
  id: 'tool_store_memory',
  name: 'store_memory',
  description: 'Stores a persistent fact, user preference, or knowledge item into long-term memory.',
  category: 'system',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'The text content or fact to remember', minLength: 1, maxLength: 5000 },
      type: {
        type: 'string',
        enum: ['fact', 'preference', 'summary', 'workspace', 'project'],
        description: 'Category of memory',
      },
      importance: {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'Importance score from 1 to 10',
      },
      scope: {
        type: 'string',
        enum: ['GLOBAL_USER', 'WORKSPACE', 'PROJECT'],
        description: 'Memory isolation scope',
      },
    },
    required: ['content'],
  },
  requiredPermissions: ['memory:write'],
  handler: async (
    input: StoreMemoryInput,
    context: ToolExecutionContext,
  ): Promise<StoreMemoryOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);
    const memoryId = crypto.randomUUID();
    const now = Date.now();
    const importance = typeof input.importance === 'number' ? Math.max(1, Math.min(10, input.importance)) : 5;
    const memType = (input.type || 'fact') as MemoryType;
    const scope = (input.scope || 'GLOBAL_USER') as MemoryScope;

    const memoryItem: MemoryItem = {
      id: memoryId,
      userId,
      workspaceId: context.auth?.workspaceId,
      type: memType,
      scope,
      content: input.content,
      importance,
      confidence: 'user_provided',
      version: 1,
      accessCount: 0,
      createdAt: now,
      updatedAt: now,
      metadata: {
        status: 'active',
        source: 'user_explicit',
      },
    };

    await memoryRepository.save(memoryItem);

    return {
      memoryId,
      content: input.content,
      type: memType,
      importance,
      storedAt: new Date(now).toISOString(),
    };
  },
  verify: async (
    output: StoreMemoryOutput,
    input: StoreMemoryInput,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = toUuid(context.auth?.userId);
    const saved = await memoryRepository.getById(output.memoryId, userId);
    if (!saved) {
      return {
        verified: false,
        error: `Memory item "${output.memoryId}" could not be retrieved from persistent memory.`,
      };
    }
    if (saved.content !== input.content) {
      return {
        verified: false,
        error: `Memory content mismatch: expected "${input.content}", found "${saved.content}".`,
      };
    }
    return {
      verified: true,
      details: `Memory item "${saved.id}" verified in database.`,
      verifiedObject: saved,
    };
  },
};

// ─── Recall Memory Tool ──────────────────────────────────────────────────────

export interface RecallMemoryInput extends Record<string, unknown> {
  readonly query: string;
  readonly type?: string;
  readonly limit?: number;
}

export interface MemorySummary {
  readonly memoryId: string;
  readonly content: string;
  readonly type: string;
  readonly importance: number;
  readonly createdAt: string;
}

export interface RecallMemoryOutput {
  readonly memories: readonly MemorySummary[];
  readonly total: number;
}

export const recallMemoryTool: ToolDefinition<RecallMemoryInput, RecallMemoryOutput> = {
  id: 'tool_recall_memory',
  name: 'recall_memory',
  description: 'Searches and retrieves relevant stored facts, preferences, or notes from long-term memory.',
  category: 'system',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term or concept to recall' },
      type: { type: 'string', description: 'Filter by memory type' },
      limit: { type: 'integer', description: 'Max items to recall', minimum: 1, maximum: 50 },
    },
    required: ['query'],
  },
  requiredPermissions: ['memory:read'],
  handler: async (
    input: RecallMemoryInput,
    context: ToolExecutionContext,
  ): Promise<RecallMemoryOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);

    let items = await memoryRepository.findByContent(userId, input.query);
    if (items.length === 0) {
      // Fallback: search all memories for user
      const all = await memoryRepository.getByUser(userId);
      const q = input.query.toLowerCase();
      items = all.filter((m) => m.content.toLowerCase().includes(q));
    }

    if (input.type) {
      items = items.filter((m) => m.type === input.type);
    }

    const limit = input.limit || 10;
    const page = items.slice(0, limit);

    const summaries: MemorySummary[] = page.map((m) => ({
      memoryId: m.id,
      content: m.content,
      type: m.type,
      importance: m.importance,
      createdAt: new Date(m.createdAt).toISOString(),
    }));

    return {
      memories: summaries,
      total: items.length,
    };
  },
};

// ─── Update Memory Tool ──────────────────────────────────────────────────────

export interface UpdateMemoryInput extends Record<string, unknown> {
  readonly memoryId: string;
  readonly content?: string;
  readonly importance?: number;
}

export interface UpdateMemoryOutput {
  readonly memoryId: string;
  readonly updated: boolean;
  readonly updatedAt: string;
}

export const updateMemoryTool: ToolDefinition<UpdateMemoryInput, UpdateMemoryOutput> = {
  id: 'tool_update_memory',
  name: 'update_memory',
  description: 'Updates an existing memory item with new content or revised importance score.',
  category: 'system',
  riskLevel: 'MODIFY',
  inputSchema: {
    type: 'object',
    properties: {
      memoryId: { type: 'string', description: 'The unique ID of the memory item' },
      content: { type: 'string', description: 'Updated memory content' },
      importance: { type: 'integer', minimum: 1, maximum: 10, description: 'New importance score' },
    },
    required: ['memoryId'],
  },
  requiredPermissions: ['memory:write'],
  handler: async (
    input: UpdateMemoryInput,
    context: ToolExecutionContext,
  ): Promise<UpdateMemoryOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);

    const existing = await memoryRepository.getById(input.memoryId, userId);
    if (!existing) {
      throw new Error(`Memory item "${input.memoryId}" not found for user.`);
    }

    const patch: Record<string, unknown> = {};
    if (input.content !== undefined) patch.content = input.content;
    if (input.importance !== undefined) patch.importance = Math.max(1, Math.min(10, input.importance));

    const updated = await memoryRepository.update(input.memoryId, userId, patch as Partial<MemoryItem>);
    if (!updated) {
      throw new Error(`Failed to update memory item "${input.memoryId}".`);
    }

    return {
      memoryId: updated.id,
      updated: true,
      updatedAt: new Date(updated.updatedAt).toISOString(),
    };
  },
  verify: async (
    output: UpdateMemoryOutput,
    input: UpdateMemoryInput,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = toUuid(context.auth?.userId);
    const saved = await memoryRepository.getById(output.memoryId, userId);
    if (!saved) {
      return { verified: false, error: `Updated memory "${output.memoryId}" not found in database.` };
    }
    if (input.content && saved.content !== input.content) {
      return { verified: false, error: `Memory content was not updated in database.` };
    }
    return {
      verified: true,
      details: `Memory item "${saved.id}" successfully updated and verified in database.`,
      verifiedObject: saved,
    };
  },
};

// ─── Forget Memory Tool ──────────────────────────────────────────────────────

export interface ForgetMemoryInput extends Record<string, unknown> {
  readonly memoryId: string;
}

export interface ForgetMemoryOutput {
  readonly memoryId: string;
  readonly forgotten: boolean;
}

export const forgetMemoryTool: ToolDefinition<ForgetMemoryInput, ForgetMemoryOutput> = {
  id: 'tool_forget_memory',
  name: 'forget_memory',
  description: 'Permanently deletes or removes a specific memory item from the store.',
  category: 'system',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      memoryId: { type: 'string', description: 'The unique ID of the memory item to forget' },
    },
    required: ['memoryId'],
  },
  requiredPermissions: ['memory:write'],
  handler: async (
    input: ForgetMemoryInput,
    context: ToolExecutionContext,
  ): Promise<ForgetMemoryOutput> => {
    const rawUserId = context.auth?.userId;
    if (!rawUserId) {
      throw new Error('Authentication required: userId is missing from execution context.');
    }
    const userId = toUuid(rawUserId);

    const existing = await memoryRepository.getById(input.memoryId, userId);
    if (!existing) {
      throw new Error(`Memory item "${input.memoryId}" not found.`);
    }

    const forgotten = await memoryRepository.delete(input.memoryId, userId);
    return {
      memoryId: input.memoryId,
      forgotten,
    };
  },
  verify: async (
    output: ForgetMemoryOutput,
    _input: ForgetMemoryInput,
    context: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const userId = toUuid(context.auth?.userId);
    const existing = await memoryRepository.getById(output.memoryId, userId);
    if (existing !== null && existing !== undefined) {
      return {
        verified: false,
        error: `Memory item "${output.memoryId}" still exists in database after deletion.`,
      };
    }
    return {
      verified: true,
      details: `Memory item "${output.memoryId}" verified as deleted from database.`,
    };
  },
};

// ─── Export All Memory Tools ─────────────────────────────────────────────────

export const memoryTools = [
  storeMemoryTool,
  recallMemoryTool,
  updateMemoryTool,
  forgetMemoryTool,
] as const;

for (const tool of memoryTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
