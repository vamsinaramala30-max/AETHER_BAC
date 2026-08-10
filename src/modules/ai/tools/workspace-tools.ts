/**
 * AETHER AI — Workspace Tools
 * Tool definitions for workspace operations.
 */

import type { ToolDefinition, ToolExecutionContext } from './tool-types.js';

// ─── Workspace Tool I/O Types ────────────────────────────────────────────────

export interface GetWorkspaceInfoInput {
  readonly workspaceId?: string;
}

export interface WorkspaceInfo {
  readonly workspaceId: string;
  readonly name: string;
  readonly memberCount: number;
  readonly projectCount: number;
  readonly createdAt: string;
}

export interface ListWorkspaceMembersInput {
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

export interface SearchWorkspaceInput {
  readonly query: string;
  readonly scope?: 'all' | 'tasks' | 'projects' | 'documents';
  readonly limit?: number;
}

export interface WorkspaceSearchResultItem {
  readonly type: 'task' | 'project' | 'document';
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
  name: 'get_workspace_info',
  description: 'Retrieves information about the current workspace.',
  category: 'workspace',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string', description: 'Optional workspace ID (defaults to current)' },
    },
  },
  requiredPermissions: ['workspace:read'],
  handler: async (_input: GetWorkspaceInfoInput, _context: ToolExecutionContext): Promise<WorkspaceInfo> => {
    // Integration point — delegates to workspace service
    return {
      workspaceId: _input.workspaceId ?? 'current',
      name: '',
      memberCount: 0,
      projectCount: 0,
      createdAt: new Date().toISOString(),
    };
  },
};

// ─── List Workspace Members Tool ─────────────────────────────────────────────

export const listWorkspaceMembersTool: ToolDefinition<ListWorkspaceMembersInput, ListWorkspaceMembersOutput> = {
  name: 'list_workspace_members',
  description: 'Lists members of the workspace.',
  category: 'workspace',
  inputSchema: {
    type: 'object',
    properties: {
      workspaceId: { type: 'string', description: 'Optional workspace ID' },
      limit: { type: 'integer', description: 'Max members to return', minimum: 1, maximum: 200 },
    },
  },
  requiredPermissions: ['workspace:read'],
  handler: async (_input: ListWorkspaceMembersInput, _context: ToolExecutionContext): Promise<ListWorkspaceMembersOutput> => {
    return { members: [], total: 0 };
  },
};

// ─── Search Workspace Tool ───────────────────────────────────────────────────

export const searchWorkspaceTool: ToolDefinition<SearchWorkspaceInput, SearchWorkspaceOutput> = {
  name: 'search_workspace',
  description: 'Searches across the workspace for tasks, projects, and documents.',
  category: 'workspace',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query', minLength: 1, maxLength: 500 },
      scope: { type: 'string', enum: ['all', 'tasks', 'projects', 'documents'], description: 'Search scope' },
      limit: { type: 'integer', description: 'Max results', minimum: 1, maximum: 50 },
    },
    required: ['query'],
  },
  requiredPermissions: ['workspace:read'],
  handler: async (input: SearchWorkspaceInput, _context: ToolExecutionContext): Promise<SearchWorkspaceOutput> => {
    return { results: [], total: 0, query: input.query };
  },
};

// ─── All Workspace Tools ─────────────────────────────────────────────────────

export const workspaceTools = [getWorkspaceInfoTool, listWorkspaceMembersTool, searchWorkspaceTool] as const;
