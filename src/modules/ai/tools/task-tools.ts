/**
 * AETHER AI — Task Tools
 * Authoritative tool definitions for task operations.
 * Implements strict schema validation, permission checks, execution, and real backend verification.
 */

import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { TasksRepository } from '../../projects/tasks/tasks.repository.js';
import { TaskStatus, PriorityLevel } from '../../projects/projects.constants.js';

const tasksRepo = new TasksRepository();

function assertTaskAccess(task: any, context: ToolExecutionContext): void {
  const currentUserId = context?.auth?.userId;
  const roles = context?.auth?.roles || [];
  const isAdmin = roles.includes('admin') || roles.includes('ADMIN') || roles.includes('SUPERADMIN') || (context?.auth as any)?.role === 'admin';
  if (isAdmin) return;
  if (!currentUserId) return;

  const isOwner = task.creatorId === currentUserId;
  const isAssignee = Array.isArray(task.assigneeIds) && task.assigneeIds.includes(currentUserId);
  const isSameWorkspace = !!(task.workspaceId && context?.auth?.workspaceId && task.workspaceId === context.auth.workspaceId);

  if ((task.creatorId || task.workspaceId || (task.assigneeIds && task.assigneeIds.length > 0)) && !isOwner && !isAssignee && !isSameWorkspace) {
    throw new Error(`Access denied: Task "${task.id}" belongs to another tenant or user.`);
  }
}

// ─── Create Task Tool ────────────────────────────────────────────────────────

export interface CreateTaskInput extends Record<string, unknown> {
  readonly title: string;
  readonly description?: string;
  readonly priority?: 'low' | 'medium' | 'high' | 'urgent';
  readonly assigneeId?: string;
  readonly dueDate?: string;
  readonly projectId?: string;
}

export interface CreateTaskOutput {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly projectId?: string;
  readonly createdAt: string;
}

export const createTaskTool: ToolDefinition<CreateTaskInput, CreateTaskOutput> = {
  id: 'tool_create_task',
  name: 'create_task',
  description: 'Creates a new task in the workspace task management system.',
  category: 'tasks',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title', minLength: 1, maxLength: 500 },
      description: { type: 'string', description: 'Detailed task description', maxLength: 5000 },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Priority level',
      },
      assigneeId: { type: 'string', description: 'User ID to assign this task to' },
      dueDate: { type: 'string', description: 'Due date in ISO 8601 format' },
      projectId: { type: 'string', description: 'Associated project ID' },
    },
    required: ['title'],
  },
  requiredPermissions: ['tasks:write'],
  handler: async (
    input: CreateTaskInput,
    context: ToolExecutionContext,
  ): Promise<CreateTaskOutput> => {
    const userId = context.auth.userId;
    const prio = (input.priority?.toUpperCase() || 'MEDIUM') as PriorityLevel;
    const task = await tasksRepo.save({
      title: input.title,
      description: input.description ?? null,
      projectId: input.projectId ?? undefined,
      creatorId: userId,
      priority: prio,
      status: TaskStatus.TODO,
      assigneeIds: input.assigneeId ? [input.assigneeId] : [userId],
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
    });

    return {
      taskId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      projectId: task.projectId ?? undefined,
      createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : new Date().toISOString(),
    };
  },
  verify: async (
    output: CreateTaskOutput,
    input: CreateTaskInput,
  ): Promise<ToolVerificationResult> => {
    const saved = await tasksRepo.findById(output.taskId);
    if (!saved) {
      return {
        verified: false,
        error: `Task with ID ${output.taskId} could not be retrieved from the database.`,
      };
    }
    if (saved.title !== input.title) {
      return {
        verified: false,
        error: `Task title mismatch in database: expected "${input.title}", found "${saved.title}".`,
      };
    }
    return {
      verified: true,
      details: `Task "${saved.title}" (ID: ${saved.id}) verified in database with status ${saved.status}.`,
      verifiedObject: saved,
    };
  },
};

// ─── Get Task Tool ───────────────────────────────────────────────────────────

export interface GetTaskInput extends Record<string, unknown> {
  readonly taskId: string;
}

export interface TaskDetails {
  readonly taskId: string;
  readonly title: string;
  readonly description?: string;
  readonly status: string;
  readonly priority: string;
  readonly assigneeIds: readonly string[];
  readonly dueDate?: string;
  readonly isCompleted: boolean;
  readonly createdAt: string;
}

export const getTaskTool: ToolDefinition<GetTaskInput, TaskDetails> = {
  id: 'tool_get_task',
  name: 'get_task',
  description: 'Retrieves details for a specific task by its ID.',
  category: 'tasks',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The unique ID of the task to retrieve' },
    },
    required: ['taskId'],
  },
  requiredPermissions: ['tasks:read'],
  handler: async (input: GetTaskInput, context: ToolExecutionContext): Promise<TaskDetails> => {
    const task = await tasksRepo.findById(input.taskId);
    if (!task) {
      throw new Error(`Task with ID "${input.taskId}" not found.`);
    }
    assertTaskAccess(task, context);
    return {
      taskId: task.id,
      title: task.title,
      description: task.description ?? undefined,
      status: task.status,
      priority: task.priority,
      assigneeIds: task.assigneeIds || [],
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
      isCompleted: task.isCompleted,
      createdAt: task.createdAt ? new Date(task.createdAt).toISOString() : new Date().toISOString(),
    };
  },
};

// ─── List Tasks Tool ─────────────────────────────────────────────────────────

export interface ListTasksInput extends Record<string, unknown> {
  readonly status?: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'todo';
  readonly priority?: 'low' | 'medium' | 'high' | 'urgent';
  readonly projectId?: string;
  readonly limit?: number;
}

export interface TaskSummary {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate?: string;
}

export interface ListTasksOutput {
  readonly tasks: readonly TaskSummary[];
  readonly total: number;
}

export const listTasksTool: ToolDefinition<ListTasksInput, ListTasksOutput> = {
  id: 'tool_list_tasks',
  name: 'list_tasks',
  description: 'Lists tasks in the workspace, optionally filtered by status, priority, or project.',
  category: 'tasks',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'completed', 'cancelled', 'todo'],
        description: 'Filter by task status',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Filter by priority',
      },
      projectId: { type: 'string', description: 'Filter by project ID' },
      limit: {
        type: 'integer',
        description: 'Maximum number of tasks to return',
        minimum: 1,
        maximum: 100,
      },
    },
  },
  requiredPermissions: ['tasks:read'],
  handler: async (
    input: ListTasksInput,
    context: ToolExecutionContext,
  ): Promise<ListTasksOutput> => {
    const userId = context.auth.userId;
    let statusFilter: TaskStatus | undefined;
    if (input.status) {
      if (input.status === 'completed') statusFilter = TaskStatus.DONE;
      else if (input.status === 'in_progress') statusFilter = TaskStatus.IN_PROGRESS;
      else if (input.status === 'cancelled') statusFilter = TaskStatus.CANCELLED;
      else statusFilter = TaskStatus.TODO;
    }

    const priorityFilter = input.priority
      ? (input.priority.toUpperCase() as PriorityLevel)
      : undefined;

    const res = await tasksRepo.findMany({
      assigneeId: userId,
      projectId: input.projectId,
      status: statusFilter,
      priority: priorityFilter,
      limit: input.limit || 20,
    });

    const summaries: TaskSummary[] = res.data.map((t) => ({
      taskId: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
    }));

    return { tasks: summaries, total: res.total };
  },
};

// ─── Update Task Tool ────────────────────────────────────────────────────────

export interface UpdateTaskInput extends Record<string, unknown> {
  readonly taskId: string;
  readonly title?: string;
  readonly description?: string;
  readonly status?: 'open' | 'in_progress' | 'completed' | 'cancelled' | 'todo';
  readonly priority?: 'low' | 'medium' | 'high' | 'urgent';
  readonly dueDate?: string;
}

export interface UpdateTaskOutput {
  readonly taskId: string;
  readonly updated: boolean;
  readonly status: string;
  readonly priority: string;
  readonly updatedAt: string;
}

export const updateTaskTool: ToolDefinition<UpdateTaskInput, UpdateTaskOutput> = {
  id: 'tool_update_task',
  name: 'update_task',
  description: "Updates an existing task's status, title, description, due date, or priority.",
  category: 'tasks',
  riskLevel: 'MODIFY',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The ID of the task to update' },
      title: { type: 'string', description: 'New title', maxLength: 500 },
      description: { type: 'string', description: 'New description', maxLength: 5000 },
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'completed', 'cancelled', 'todo'],
        description: 'New status',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'New priority',
      },
      dueDate: { type: 'string', description: 'New due date in ISO 8601' },
    },
    required: ['taskId'],
  },
  requiredPermissions: ['tasks:write'],
  handler: async (
    input: UpdateTaskInput,
    context: ToolExecutionContext,
  ): Promise<UpdateTaskOutput> => {
    const task = await tasksRepo.findById(input.taskId);
    if (!task) {
      throw new Error(`Task with ID "${input.taskId}" not found.`);
    }
    assertTaskAccess(task, context);

    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.priority !== undefined) task.priority = input.priority.toUpperCase() as PriorityLevel;
    if (input.dueDate !== undefined) task.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.status !== undefined) {
      if (input.status === 'completed') {
        task.status = TaskStatus.DONE;
        task.isCompleted = true;
        task.completedAt = new Date();
      } else if (input.status === 'in_progress') {
        task.status = TaskStatus.IN_PROGRESS;
        task.isCompleted = false;
        task.completedAt = null;
      } else if (input.status === 'cancelled') {
        task.status = TaskStatus.CANCELLED;
        task.isCompleted = false;
      } else {
        task.status = TaskStatus.TODO;
        task.isCompleted = false;
        task.completedAt = null;
      }
    }

    const saved = await tasksRepo.save(task);

    return {
      taskId: saved.id,
      updated: true,
      status: saved.status,
      priority: saved.priority,
      updatedAt: saved.updatedAt
        ? new Date(saved.updatedAt).toISOString()
        : new Date().toISOString(),
    };
  },
  verify: async (
    output: UpdateTaskOutput,
    input: UpdateTaskInput,
  ): Promise<ToolVerificationResult> => {
    const saved = await tasksRepo.findById(output.taskId);
    if (!saved) {
      return { verified: false, error: `Updated task ${output.taskId} could not be retrieved.` };
    }
    if (input.title && saved.title !== input.title) {
      return { verified: false, error: `Task title was not updated in database.` };
    }
    if (input.status) {
      const expectedStatus =
        input.status === 'completed'
          ? TaskStatus.DONE
          : input.status === 'in_progress'
            ? TaskStatus.IN_PROGRESS
            : TaskStatus.TODO;
      if (saved.status !== expectedStatus) {
        return {
          verified: false,
          error: `Task status was not updated to ${expectedStatus} in database.`,
        };
      }
    }
    return {
      verified: true,
      details: `Task "${saved.title}" successfully updated and verified in database.`,
      verifiedObject: saved,
    };
  },
};

// ─── Complete Task Tool ──────────────────────────────────────────────────────

export interface CompleteTaskInput extends Record<string, unknown> {
  readonly taskId: string;
}

export interface CompleteTaskOutput {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly isCompleted: boolean;
  readonly completedAt: string;
}

export const completeTaskTool: ToolDefinition<CompleteTaskInput, CompleteTaskOutput> = {
  id: 'tool_complete_task',
  name: 'complete_task',
  description: 'Marks a specific task as completed in the database.',
  category: 'tasks',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The ID of the task to mark complete' },
    },
    required: ['taskId'],
  },
  requiredPermissions: ['tasks:write'],
  handler: async (
    input: CompleteTaskInput,
    context: ToolExecutionContext,
  ): Promise<CompleteTaskOutput> => {
    const task = await tasksRepo.findById(input.taskId);
    if (!task) {
      throw new Error(`Task with ID "${input.taskId}" not found.`);
    }
    assertTaskAccess(task, context);

    const now = new Date();
    task.status = TaskStatus.DONE;
    task.isCompleted = true;
    task.completedAt = now;

    const saved = await tasksRepo.save(task);

    return {
      taskId: saved.id,
      title: saved.title,
      status: saved.status,
      isCompleted: saved.isCompleted,
      completedAt: saved.completedAt
        ? new Date(saved.completedAt).toISOString()
        : now.toISOString(),
    };
  },
  verify: async (output: CompleteTaskOutput): Promise<ToolVerificationResult> => {
    const saved = await tasksRepo.findById(output.taskId);
    if (!saved) {
      return {
        verified: false,
        error: `Task ${output.taskId} not found in database after completion.`,
      };
    }
    if (saved.status !== TaskStatus.DONE || !saved.isCompleted) {
      return {
        verified: false,
        error: `Task ${output.taskId} is not marked as DONE/completed in database.`,
      };
    }
    return {
      verified: true,
      details: `Task "${saved.title}" verified as completed in database.`,
      verifiedObject: saved,
    };
  },
};

// ─── Prioritize Task Tool ────────────────────────────────────────────────────

export interface PrioritizeTaskInput extends Record<string, unknown> {
  readonly taskId: string;
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface PrioritizeTaskOutput {
  readonly taskId: string;
  readonly title: string;
  readonly priority: string;
}

export const prioritizeTaskTool: ToolDefinition<PrioritizeTaskInput, PrioritizeTaskOutput> = {
  id: 'tool_prioritize_task',
  name: 'prioritize_task',
  description: 'Changes the priority level of a specific task.',
  category: 'tasks',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The ID of the task' },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'New priority level',
      },
    },
    required: ['taskId', 'priority'],
  },
  requiredPermissions: ['tasks:write'],
  handler: async (
    input: PrioritizeTaskInput,
    context: ToolExecutionContext,
  ): Promise<PrioritizeTaskOutput> => {
    const task = await tasksRepo.findById(input.taskId);
    if (!task) {
      throw new Error(`Task with ID "${input.taskId}" not found.`);
    }
    assertTaskAccess(task, context);

    task.priority = input.priority.toUpperCase() as PriorityLevel;
    const saved = await tasksRepo.save(task);

    return {
      taskId: saved.id,
      title: saved.title,
      priority: saved.priority,
    };
  },
  verify: async (
    output: PrioritizeTaskOutput,
    input: PrioritizeTaskInput,
  ): Promise<ToolVerificationResult> => {
    const saved = await tasksRepo.findById(output.taskId);
    if (!saved) {
      return { verified: false, error: `Task ${output.taskId} not found in database.` };
    }
    if (saved.priority !== input.priority.toUpperCase()) {
      return {
        verified: false,
        error: `Task priority was not updated to ${input.priority} in database.`,
      };
    }
    return {
      verified: true,
      details: `Task "${saved.title}" priority verified as ${saved.priority} in database.`,
      verifiedObject: saved,
    };
  },
};

// ─── Delete Task Tool ────────────────────────────────────────────────────────

export interface DeleteTaskInput extends Record<string, unknown> {
  readonly taskId: string;
}

export interface DeleteTaskOutput {
  readonly taskId: string;
  readonly deleted: boolean;
}

export const deleteTaskTool: ToolDefinition<DeleteTaskInput, DeleteTaskOutput> = {
  id: 'tool_delete_task',
  name: 'delete_task',
  description: 'Permanently deletes a task from the workspace. Requires user confirmation.',
  category: 'tasks',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The ID of the task to delete' },
    },
    required: ['taskId'],
  },
  requiredPermissions: ['tasks:write'],
  handler: async (
    input: DeleteTaskInput,
    context: ToolExecutionContext,
  ): Promise<DeleteTaskOutput> => {
    const task = await tasksRepo.findById(input.taskId);
    if (!task) {
      throw new Error(`Task with ID "${input.taskId}" not found.`);
    }
    assertTaskAccess(task, context);

    const deleted = await tasksRepo.delete(input.taskId);
    return {
      taskId: input.taskId,
      deleted,
    };
  },
  verify: async (output: DeleteTaskOutput): Promise<ToolVerificationResult> => {
    const task = await tasksRepo.findById(output.taskId);
    if (task !== null && task !== undefined) {
      return {
        verified: false,
        error: `Task ${output.taskId} still exists in database after deletion.`,
      };
    }
    return {
      verified: true,
      details: `Task ${output.taskId} verified as deleted from database.`,
    };
  },
};

// ─── All Task Tools ──────────────────────────────────────────────────────────

export const taskTools = [
  createTaskTool,
  getTaskTool,
  listTasksTool,
  updateTaskTool,
  completeTaskTool,
  prioritizeTaskTool,
  deleteTaskTool,
] as const;

// Auto-register tools on load
for (const tool of taskTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
