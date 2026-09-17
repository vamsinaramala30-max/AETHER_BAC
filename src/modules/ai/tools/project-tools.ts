/**
 * AETHER AI — Project Tools
 * Authoritative tool definitions for project management operations.
 * Implements strict schemas, permission validation, real repository execution, and database verification.
 */

import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { ProjectsRepository } from '../../projects/projects.repository.js';

const projectsRepo = new ProjectsRepository();

// ─── Get Project Tool ────────────────────────────────────────────────────────

export interface GetProjectInput extends Record<string, unknown> {
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

export const getProjectTool: ToolDefinition<GetProjectInput, ProjectInfo> = {
  id: 'tool_get_project',
  name: 'get_project',
  description: 'Retrieves details about a specific project by its ID.',
  category: 'projects',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The unique project identifier' },
    },
    required: ['projectId'],
  },
  requiredPermissions: ['projects:read'],
  handler: async (input: GetProjectInput, _context: ToolExecutionContext): Promise<ProjectInfo> => {
    const proj = await projectsRepo.findById(input.projectId);
    if (!proj) {
      throw new Error(`Project "${input.projectId}" not found.`);
    }
    return {
      projectId: proj.id,
      name: proj.name,
      description: proj.description || '',
      status: proj.status || 'active',
      memberCount: proj.members.length,
      createdAt: proj.createdAt ? new Date(proj.createdAt).toISOString() : new Date().toISOString(),
    };
  },
};

// ─── List Projects Tool ──────────────────────────────────────────────────────

export interface ListProjectsInput extends Record<string, unknown> {
  readonly limit?: number;
  readonly status?: 'active' | 'archived';
}

export interface ListProjectsOutput {
  readonly projects: readonly ProjectInfo[];
  readonly total: number;
}

export const listProjectsTool: ToolDefinition<ListProjectsInput, ListProjectsOutput> = {
  id: 'tool_list_projects',
  name: 'list_projects',
  description: 'Lists all accessible projects for the authenticated user.',
  category: 'projects',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum number of projects to return',
        minimum: 1,
        maximum: 100,
      },
      status: {
        type: 'string',
        enum: ['active', 'archived'],
        description: 'Filter by project status',
      },
    },
  },
  requiredPermissions: ['projects:read'],
  handler: async (
    input: ListProjectsInput,
    context: ToolExecutionContext,
  ): Promise<ListProjectsOutput> => {
    const userId = context.auth.userId;
    const res = await projectsRepo.findMany({
      ownerId: userId,
      limit: input.limit || 20,
      isArchived: input.status === 'archived',
    });
    const summaries: ProjectInfo[] = res.data.map((p) => ({
      projectId: p.id,
      name: p.name,
      description: p.description || '',
      status: p.status || 'active',
      memberCount: p.members.length,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
    }));
    return { projects: summaries, total: res.total };
  },
};

// ─── Create Project Tool ─────────────────────────────────────────────────────

export interface CreateProjectInput extends Record<string, unknown> {
  readonly name: string;
  readonly description?: string;
}

export interface CreateProjectOutput {
  readonly projectId: string;
  readonly name: string;
  readonly createdAt: string;
}

export const createProjectTool: ToolDefinition<CreateProjectInput, CreateProjectOutput> = {
  id: 'tool_create_project',
  name: 'create_project',
  description: 'Creates a new project in the workspace.',
  category: 'projects',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Project name', minLength: 1, maxLength: 200 },
      description: { type: 'string', description: 'Project description', maxLength: 2000 },
    },
    required: ['name'],
  },
  requiredPermissions: ['projects:write'],
  handler: async (
    input: CreateProjectInput,
    context: ToolExecutionContext,
  ): Promise<CreateProjectOutput> => {
    const userId = context.auth.userId;
    const created = await projectsRepo.save({
      ownerId: userId,
      name: input.name,
      description: input.description,
    });
    return {
      projectId: created.id,
      name: created.name,
      createdAt: created.createdAt
        ? new Date(created.createdAt).toISOString()
        : new Date().toISOString(),
    };
  },
  verify: async (
    output: CreateProjectOutput,
    input: CreateProjectInput,
  ): Promise<ToolVerificationResult> => {
    const proj = await projectsRepo.findById(output.projectId);
    if (!proj) {
      return {
        verified: false,
        error: `Project ${output.projectId} could not be retrieved from database.`,
      };
    }
    if (proj.name !== input.name) {
      return {
        verified: false,
        error: `Project name mismatch: expected "${input.name}", found "${proj.name}".`,
      };
    }
    return {
      verified: true,
      details: `Project "${proj.name}" (ID: ${proj.id}) verified in database.`,
      verifiedObject: proj,
    };
  },
};

// ─── Update Project Tool ─────────────────────────────────────────────────────

export interface UpdateProjectInput extends Record<string, unknown> {
  readonly projectId: string;
  readonly name?: string;
  readonly description?: string;
  readonly status?: string;
  readonly isArchived?: boolean;
}

export interface UpdateProjectOutput {
  readonly projectId: string;
  readonly updated: boolean;
  readonly name: string;
}

export const updateProjectTool: ToolDefinition<UpdateProjectInput, UpdateProjectOutput> = {
  id: 'tool_update_project',
  name: 'update_project',
  description: 'Updates an existing project name, description, or status.',
  category: 'projects',
  riskLevel: 'MODIFY',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The unique project identifier' },
      name: { type: 'string', description: 'New project name', maxLength: 200 },
      description: { type: 'string', description: 'New project description', maxLength: 2000 },
      status: { type: 'string', description: 'New project status' },
      isArchived: { type: 'boolean', description: 'Archive status' },
    },
    required: ['projectId'],
  },
  requiredPermissions: ['projects:write'],
  handler: async (
    input: UpdateProjectInput,
    _context: ToolExecutionContext,
  ): Promise<UpdateProjectOutput> => {
    const proj = await projectsRepo.findById(input.projectId);
    if (!proj) {
      throw new Error(`Project "${input.projectId}" not found.`);
    }

    if (input.name !== undefined) proj.name = input.name;
    if (input.description !== undefined) proj.description = input.description;
    if (input.status !== undefined) proj.status = input.status as any;
    if (input.isArchived !== undefined) proj.isArchived = input.isArchived;

    const saved = await projectsRepo.save(proj);

    return {
      projectId: saved.id,
      updated: true,
      name: saved.name,
    };
  },
  verify: async (
    output: UpdateProjectOutput,
    input: UpdateProjectInput,
  ): Promise<ToolVerificationResult> => {
    const proj = await projectsRepo.findById(output.projectId);
    if (!proj) {
      return {
        verified: false,
        error: `Updated project ${output.projectId} not found in database.`,
      };
    }
    if (input.name && proj.name !== input.name) {
      return { verified: false, error: `Project name was not updated in database.` };
    }
    return {
      verified: true,
      details: `Project "${proj.name}" update verified in database.`,
      verifiedObject: proj,
    };
  },
};

// ─── Delete Project Tool ─────────────────────────────────────────────────────

export interface DeleteProjectInput extends Record<string, unknown> {
  readonly projectId: string;
}

export interface DeleteProjectOutput {
  readonly projectId: string;
  readonly deleted: boolean;
}

export const deleteProjectTool: ToolDefinition<DeleteProjectInput, DeleteProjectOutput> = {
  id: 'tool_delete_project',
  name: 'delete_project',
  description: 'Permanently deletes or archives a project. Requires user confirmation.',
  category: 'projects',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The ID of the project to delete' },
    },
    required: ['projectId'],
  },
  requiredPermissions: ['projects:write'],
  handler: async (
    input: DeleteProjectInput,
    _context: ToolExecutionContext,
  ): Promise<DeleteProjectOutput> => {
    const proj = await projectsRepo.findById(input.projectId);
    if (!proj) {
      throw new Error(`Project "${input.projectId}" not found.`);
    }
    const deleted = await projectsRepo.delete(input.projectId);
    return {
      projectId: input.projectId,
      deleted,
    };
  },
  verify: async (output: DeleteProjectOutput): Promise<ToolVerificationResult> => {
    const proj = await projectsRepo.findById(output.projectId);
    if (proj !== null && proj !== undefined) {
      return { verified: false, error: `Project ${output.projectId} still exists after deletion.` };
    }
    return {
      verified: true,
      details: `Project ${output.projectId} verified as deleted from database.`,
    };
  },
};

// ─── All Project Tools ───────────────────────────────────────────────────────

export const projectTools = [
  getProjectTool,
  listProjectsTool,
  createProjectTool,
  updateProjectTool,
  deleteProjectTool,
] as const;

// Auto-register tools on load
for (const tool of projectTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
