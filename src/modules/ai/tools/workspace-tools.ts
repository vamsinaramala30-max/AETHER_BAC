/**
 * AETHER AI — Workspace Tools
 * Tool definitions for workspace operations.
 * Performs real database queries for workspace metadata, members, and scoped searches.
 */

import type { ToolDefinition, ToolExecutionContext } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { WorkspaceRepository } from '../../workspace/workspace.repository.js';
import { db } from '../../../database/client.js';

const workspaceRepo = new WorkspaceRepository();

// ─── Workspace Tool I/O Types ────────────────────────────────────────────────

export interface GetWorkspaceInfoInput extends Record<string, unknown> {
  readonly workspaceId?: string;
}

export interface WorkspaceInfo {
  readonly workspaceId: string;
  readonly name: string;
  readonly memberCount: number;
  readonly projectCount: number;
  readonly taskCount: number;
  readonly createdAt: string;
}

export interface ListWorkspaceMembersInput extends Record<string, unknown> {
  readonly workspaceId?: string;
  readonly limit?: number;
}

export interface WorkspaceMember {
  readonly userId: string;
  readonly displayName: string;
  readonly role: string;
  readonly joinedAt: string;
}

export interface ListWorkspaceMembersOutput {
  readonly members: readonly WorkspaceMember[];
  readonly total: number;
}

export interface SearchWorkspaceInput extends Record<string, unknown> {
  readonly query: string;
  readonly scope?: 'all' | 'tasks' | 'projects' | 'documents';
  readonly limit?: number;
}

export interface WorkspaceSearchResultItem {
  readonly type: 'task' | 'project' | 'document' | 'note';
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
}

export interface SearchWorkspaceOutput {
  readonly results: readonly WorkspaceSearchResultItem[];
  readonly total: number;
  readonly query: string;
}

// ─── Get Workspace Info Tool ─────────────────────────────────────────────────

export const getWorkspaceInfoTool: ToolDefinition<GetWorkspaceInfoInput, WorkspaceInfo> = {
  id: 'tool_get_workspace_info',
  name: 'get_workspace_info',
  description: 'Retrieves information about the current workspace.',
  category: 'workspace',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string', description: 'Optional workspace ID (defaults to current)' },
    },
  },
  requiredPermissions: ['workspace:read'],
  retryable: true,
  handler: async (
    input: GetWorkspaceInfoInput,
    context: ToolExecutionContext,
  ): Promise<WorkspaceInfo> => {
    const userId = context.auth.userId;
    const targetWsId = input.workspaceId || context.auth.workspaceId;

    if (targetWsId && targetWsId !== 'current') {
      const ws = await workspaceRepo.findById(targetWsId);
      if (ws) {
        const [projCount, taskCount] = await Promise.all([
          db.project.count({ where: { workspaceId: ws.id, deletedAt: null } }),
          db.task.count({ where: { workspaceId: ws.id, deletedAt: null } }),
        ]);

        return {
          workspaceId: ws.id,
          name: ws.name,
          memberCount: ws.members?.length || 1,
          projectCount: projCount,
          taskCount,
          createdAt: ws.createdAt ? new Date(ws.createdAt).toISOString() : new Date().toISOString(),
        };
      }
    }

    // Default workspace lookup
    const workspaces = await workspaceRepo.findByUserId(userId);
    const primaryWs = workspaces[0];

    const [projCount, taskCount] = await Promise.all([
      db.project.count({ where: { ownerId: userId, deletedAt: null } }),
      db.task.count({ where: { assigneeId: userId, deletedAt: null } }),
    ]);

    return {
      workspaceId: primaryWs?.id ?? 'default_workspace',
      name: primaryWs?.name ?? 'Personal Workspace',
      memberCount: primaryWs?.members?.length ?? 1,
      projectCount: projCount,
      taskCount,
      createdAt: primaryWs?.createdAt
        ? new Date(primaryWs.createdAt).toISOString()
        : new Date().toISOString(),
    };
  },
};

// ─── List Workspace Members Tool ─────────────────────────────────────────────

export const listWorkspaceMembersTool: ToolDefinition<
  ListWorkspaceMembersInput,
  ListWorkspaceMembersOutput
> = {
  id: 'tool_list_workspace_members',
  name: 'list_workspace_members',
  description: 'Lists members of the workspace.',
  category: 'workspace',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string', description: 'Optional workspace ID' },
      limit: { type: 'integer', description: 'Max members to return', minimum: 1, maximum: 200 },
    },
  },
  requiredPermissions: ['workspace:read'],
  retryable: true,
  handler: async (
    input: ListWorkspaceMembersInput,
    context: ToolExecutionContext,
  ): Promise<ListWorkspaceMembersOutput> => {
    const userId = context.auth.userId;
    const wsId = input.workspaceId || context.auth.workspaceId;

    if (wsId && wsId !== 'current') {
      const ws = await workspaceRepo.findById(wsId);
      if (ws && ws.members) {
        const members: WorkspaceMember[] = ws.members.map((m: any) => ({
          userId: m.userId,
          displayName: m.user?.fullName || m.user?.email || 'Workspace Member',
          role: m.role || 'MEMBER',
          joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : new Date().toISOString(),
        }));
        return { members: members.slice(0, input.limit || 50), total: members.length };
      }
    }

    return {
      members: [
        {
          userId,
          displayName: 'Current User',
          role: 'OWNER',
          joinedAt: new Date().toISOString(),
        },
      ],
      total: 1,
    };
  },
};

// ─── Search Workspace Tool ───────────────────────────────────────────────────

export const searchWorkspaceTool: ToolDefinition<SearchWorkspaceInput, SearchWorkspaceOutput> = {
  id: 'tool_search_workspace',
  name: 'search_workspace',
  description: 'Searches across the workspace for tasks, projects, notes, and documents.',
  category: 'workspace',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query', minLength: 1, maxLength: 500 },
      scope: {
        type: 'string',
        enum: ['all', 'tasks', 'projects', 'documents'],
        description: 'Search scope',
      },
      limit: { type: 'integer', description: 'Max results', minimum: 1, maximum: 50 },
    },
    required: ['query'],
  },
  requiredPermissions: ['workspace:read'],
  retryable: true,
  handler: async (
    input: SearchWorkspaceInput,
    context: ToolExecutionContext,
  ): Promise<SearchWorkspaceOutput> => {
    const q = input.query.toLowerCase().trim();
    const limit = input.limit || 20;
    const scope = input.scope || 'all';
    const userId = context.auth.userId;

    const results: WorkspaceSearchResultItem[] = [];

    // Search tasks
    if (scope === 'all' || scope === 'tasks') {
      const tasks = await db.task.findMany({
        where: {
          assigneeId: userId,
          deletedAt: null,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: limit,
      });

      for (const t of tasks) {
        results.push({
          type: 'task',
          id: t.id,
          title: t.title,
          snippet: t.description ? t.description.slice(0, 200) : `Status: ${t.status}`,
          score: t.title.toLowerCase().includes(q) ? 0.95 : 0.75,
        });
      }
    }

    // Search projects
    if (scope === 'all' || scope === 'projects') {
      const projects = await db.project.findMany({
        where: {
          ownerId: userId,
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: limit,
      });

      for (const p of projects) {
        results.push({
          type: 'project',
          id: p.id,
          title: p.name,
          snippet: p.description ? p.description.slice(0, 200) : `Status: ${p.status}`,
          score: p.name.toLowerCase().includes(q) ? 0.95 : 0.75,
        });
      }
    }

    // Search documents and notes
    if (scope === 'all' || scope === 'documents') {
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
            userId,
            deletedAt: null,
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: limit,
        }),
      ]);

      for (const d of docs) {
        const docTitle = d.fileName || 'Untitled Document';
        results.push({
          type: 'document',
          id: d.id,
          title: docTitle,
          snippet: (d.content || '').slice(0, 200),
          score: docTitle.toLowerCase().includes(q) ? 0.95 : 0.75,
        });
      }

      for (const n of notes) {
        results.push({
          type: 'note',
          id: n.id,
          title: n.title,
          snippet: (n.content || '').slice(0, 200),
          score: n.title.toLowerCase().includes(q) ? 0.95 : 0.75,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const finalResults = results.slice(0, limit);

    return { results: finalResults, total: finalResults.length, query: input.query };
  },
};

// ─── All Workspace Tools ─────────────────────────────────────────────────────

export const workspaceTools = [
  getWorkspaceInfoTool,
  listWorkspaceMembersTool,
  searchWorkspaceTool,
] as const;

// Auto-register tools on load
for (const tool of workspaceTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}

