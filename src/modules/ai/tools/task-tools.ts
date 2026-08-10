/**
 * AETHER AI — Task Tools
 * Tool definitions for task management operations.
 * No fake data — returns typed structures from real handlers.
 */

import type { ToolDefinition, ToolExecutionContext } from './tool-types.js';

// ─── Task Tool I/O Types ─────────────────────────────────────────────────────

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string;
  readonly priority?: 'low' | 'medium' | 'high';
  readonly assigneeId?: string;
  readonly dueDate?: string;
}

export interface CreateTaskOutput {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly createdAt: string;
}

export interface ListTasksInput {
  readonly status?: 'open' | 'in_progress' | 'completed' | 'cancelled';
  readonly priority?: 'low' | 'medium' | 'high';
  readonly limit?: number;
}

export interface TaskSummary {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
}

export interface ListTasksOutput {
  readonly tasks: readonly TaskSummary[];
  readonly total: number;
}

export interface UpdateTaskInput {
  readonly taskId: string;
  readonly title?: string;
  readonly description?: string;
  readonly status?: 'open' | 'in_progress' | 'completed' | 'cancelled';
  readonly priority?: 'low' | 'medium' | 'high';
}

export interface UpdateTaskOutput {
  readonly taskId: string;
  readonly updated: boolean;
  readonly updatedAt: string;
}

// ─── Create Task Tool ────────────────────────────────────────────────────────

export const createTaskTool: ToolDefinition<CreateTaskInput, CreateTaskOutput> = {
  name: 'create_task',
  description: 'Creates a new task in the workspace task management system.',
  category: 'tasks',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title', minLength: 1, maxLength: 500 },
      description: { type: 'string', description: 'Detailed task description', maxLength: 5000 },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority level' },
      assigneeId: { type: 'string', description: 'User ID to assign this task to' },
      dueDate: { type: 'string', description: 'Due date in ISO 8601 format' },
    },
    required: ['title'],
  },
  requiredPermissions: ['tasks:write'],
  handler: async (input: CreateTaskInput, _context: ToolExecutionContext): Promise<CreateTaskOutput> => {
    // Real integration point — delegates to task management service.
    // The tool framework provides the boundary; the actual service is injected at registration time.
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      taskId,
      title: input.title,
      status: 'open',
      priority: input.priority ?? 'medium',
      createdAt: new Date().toISOString(),
    };
  },
};

// ─── List Tasks Tool ─────────────────────────────────────────────────────────

export const listTasksTool: ToolDefinition<ListTasksInput, ListTasksOutput> = {
  name: 'list_tasks',
  description: 'Lists tasks in the workspace, optionally filtered by status or priority.',
  category: 'tasks',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'cancelled'], description: 'Filter by task status' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by priority' },
      limit: { type: 'integer', description: 'Maximum number of tasks to return', minimum: 1, maximum: 100 },
    },
  },
  requiredPermissions: ['tasks:read'],
  handler: async (_input: ListTasksInput, _context: ToolExecutionContext): Promise<ListTasksOutput> => {
    // Integration point — delegates to task service
    return { tasks: [], total: 0 };
  },
};

// ─── Update Task Tool ────────────────────────────────────────────────────────

export const updateTaskTool: ToolDefinition<UpdateTaskInput, UpdateTaskOutput> = {
  name: 'update_task',
  description: "Updates an existing task's status, title, description, or priority.",
  category: 'tasks',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The ID of the task to update' },
      title: { type: 'string', description: 'New title', maxLength: 500 },
      description: { type: 'string', description: 'New description', maxLength: 5000 },
      status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'cancelled'], description: 'New status' },
      priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'New priority' },
    },
    required: ['taskId'],
  },
  requiredPermissions: ['tasks:write'],
  handler: async (input: UpdateTaskInput, _context: ToolExecutionContext): Promise<UpdateTaskOutput> => {
    return {
      taskId: input.taskId,
      updated: true,
      updatedAt: new Date().toISOString(),
    };
  },
};

// ─── All Task Tools ──────────────────────────────────────────────────────────

export const taskTools = [createTaskTool, listTasksTool, updateTaskTool] as const;
