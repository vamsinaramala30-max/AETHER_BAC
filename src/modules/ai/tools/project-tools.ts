/**
 * AETHER AI — Project Tools
 * Tool definitions for project management operations.
 */

import type { ToolDefinition, ToolExecutionContext } from './tool-types.js';

// ─── Project Tool I/O Types ──────────────────────────────────────────────────

export interface GetProjectInput {
  readonly projectId: string;
}

export interface ProjectInfo {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly status: string;
  readonly memberCount: number;
  readonly createdAt: string;
}

export interface ListProjectsInput {
  readonly limit?: number;
  readonly status?: 'active' | 'archived';
}

export interface ListProjectsOutput {
  readonly projects: readonly ProjectInfo[];
  readonly total: number;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string;
}

export interface CreateProjectOutput {
  readonly projectId: string;
  readonly name: string;
  readonly createdAt: string;
}

// ─── Get Project Tool ────────────────────────────────────────────────────────

export const getProjectTool: ToolDefinition<GetProjectInput, ProjectInfo> = {
  name: 'get_project',
  description: 'Retrieves details about a specific project by its ID.',
  category: 'projects',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The unique project identifier' },
    },
    required: ['projectId'],
  },
  requiredPermissions: ['projects:read'],
  handler: async (input: GetProjectInput, _context: ToolExecutionContext): Promise<ProjectInfo> => {
    // Integration point — delegates to project management service
    return {
      projectId: input.projectId,
      name: '',
      description: '',
      status: 'active',
      memberCount: 0,
      createdAt: new Date().toISOString(),
    };
  },
};

// ─── List Projects Tool ──────────────────────────────────────────────────────

export const listProjectsTool: ToolDefinition<ListProjectsInput, ListProjectsOutput> = {
  name: 'list_projects',
  description: 'Lists all accessible projects for the authenticated user.',
  category: 'projects',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Maximum number of projects to return', minimum: 1, maximum: 100 },
      status: { type: 'string', enum: ['active', 'archived'], description: 'Filter by project status' },
    },
  },
  requiredPermissions: ['projects:read'],
  handler: async (_input: ListProjectsInput, _context: ToolExecutionContext): Promise<ListProjectsOutput> => {
    return { projects: [], total: 0 };
  },
};

// ─── Create Project Tool ─────────────────────────────────────────────────────

export const createProjectTool: ToolDefinition<CreateProjectInput, CreateProjectOutput> = {
  name: 'create_project',
  description: 'Creates a new project in the workspace.',
  category: 'projects',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Project name', minLength: 1, maxLength: 200 },
      description: { type: 'string', description: 'Project description', maxLength: 2000 },
    },
    required: ['name'],
  },
  requiredPermissions: ['projects:write'],
  handler: async (input: CreateProjectInput, _context: ToolExecutionContext): Promise<CreateProjectOutput> => {
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      projectId,
      name: input.name,
      createdAt: new Date().toISOString(),
    };
  },
};

// ─── All Project Tools ───────────────────────────────────────────────────────

export const projectTools = [getProjectTool, listProjectsTool, createProjectTool] as const;
