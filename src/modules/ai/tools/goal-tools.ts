/**
 * AETHER AI — Goal Management & Progress Tools
 * Authoritative tools for creating, updating, monitoring, and analyzing user goals.
 * Calculates real progress metrics strictly against database state.
 */

import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { GoalsRepository } from '../../projects/goals/goals.repository.js';
import { GoalsService } from '../../projects/goals/goals.service.js';
import { GoalStatus } from '../../projects/projects.constants.js';

const goalsRepo = new GoalsRepository();
const goalsService = new GoalsService(goalsRepo);

// ─── Create Goal Tool ────────────────────────────────────────────────────────

export interface CreateGoalInput extends Record<string, unknown> {
  readonly title: string;
  readonly description?: string;
  readonly targetValue?: number;
  readonly unit?: string;
  readonly category?: string;
  readonly deadline?: string;
  readonly projectId?: string;
}

export interface CreateGoalOutput {
  readonly goalId: string;
  readonly title: string;
  readonly status: string;
  readonly targetValue: number;
  readonly currentValue: number;
  readonly unit: string;
  readonly createdAt: string;
}

export const createGoalTool: ToolDefinition<CreateGoalInput, CreateGoalOutput> = {
  id: 'tool_create_goal',
  name: 'create_goal',
  description:
    'Creates a new goal or objective in the user workspace with measurable target values.',
  category: 'goals',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The title of the goal' },
      description: { type: 'string', description: 'Detailed objective description' },
      targetValue: { type: 'number', description: 'Target numeric value to reach', default: 100 },
      unit: {
        type: 'string',
        description: 'Unit of measurement (e.g. %, hours, tasks, pts)',
        default: '%',
      },
      category: { type: 'string', description: 'Goal category (e.g. Career, Project, Personal)' },
      deadline: { type: 'string', description: 'Target completion date (ISO string)' },
      projectId: { type: 'string', description: 'Optional project ID to associate with' },
    },
    required: ['title'],
  },
  requiredPermissions: ['goals:write'],
  handler: async (
    input: CreateGoalInput,
    context: ToolExecutionContext,
  ): Promise<CreateGoalOutput> => {
    const userId = context.auth.userId;
    const goal = await goalsService.createGoal({
      userId,
      title: input.title,
      description: input.description,
      targetValue: input.targetValue || 100,
      unit: input.unit || '%',
      category: input.category || 'General',
      type: 'METRIC' as any,
      deadline: input.deadline ? new Date(input.deadline) : new Date(),
      linkedProjectIds: input.projectId ? [input.projectId] : [],
    });

    return {
      goalId: goal.id,
      title: goal.title,
      status: goal.status,
      targetValue: goal.targetValue,
      currentValue: goal.currentValue,
      unit: goal.unit ?? '',
      createdAt: goal.createdAt ? new Date(goal.createdAt).toISOString() : new Date().toISOString(),
    };
  },
  verify: async (
    output: CreateGoalOutput,
    _input: CreateGoalInput,
  ): Promise<ToolVerificationResult> => {
    const saved = await goalsRepo.findById(output.goalId);
    if (!saved) {
      return {
        verified: false,
        error: `Goal ${output.goalId} could not be retrieved from the database.`,
      };
    }
    return {
      verified: true,
      details: `Goal "${saved.title}" verified in database (target: ${saved.targetValue} ${saved.unit}, status: ${saved.status}).`,
      verifiedObject: saved,
    };
  },
};

// ─── Get Goal Tool ───────────────────────────────────────────────────────────

export interface GetGoalInput extends Record<string, unknown> {
  readonly goalId: string;
}

export interface GoalDetails {
  readonly goalId: string;
  readonly title: string;
  readonly description?: string;
  readonly status: string;
  readonly targetValue: number;
  readonly currentValue: number;
  readonly unit: string;
  readonly progressPercentage: number;
  readonly deadline: string;
  readonly isCompleted: boolean;
}

export const getGoalTool: ToolDefinition<GetGoalInput, GoalDetails> = {
  id: 'tool_get_goal',
  name: 'get_goal',
  description: 'Retrieves details, milestones, and current progress for a specific goal.',
  category: 'goals',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      goalId: { type: 'string', description: 'The ID of the goal to retrieve' },
    },
    required: ['goalId'],
  },
  requiredPermissions: ['goals:read'],
  handler: async (input: GetGoalInput, _context: ToolExecutionContext): Promise<GoalDetails> => {
    const goal = await goalsRepo.findById(input.goalId);
    if (!goal) {
      throw new Error(`Goal with ID "${input.goalId}" not found.`);
    }

    const progressPercentage =
      goal.targetValue > 0
        ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
        : 0;

    return {
      goalId: goal.id,
      title: goal.title,
      description: goal.description ?? undefined,
      status: goal.status,
      targetValue: goal.targetValue,
      currentValue: goal.currentValue,
      unit: goal.unit ?? '',
      progressPercentage,
      deadline: goal.deadline ? new Date(goal.deadline).toISOString() : new Date().toISOString(),
      isCompleted: goal.isCompleted,
    };
  },
};

// ─── List Goals Tool ─────────────────────────────────────────────────────────

export interface ListGoalsInput extends Record<string, unknown> {
  readonly status?: 'not_started' | 'in_progress' | 'achieved' | 'missed';
  readonly limit?: number;
}

export interface GoalSummary {
  readonly goalId: string;
  readonly title: string;
  readonly status: string;
  readonly targetValue: number;
  readonly currentValue: number;
  readonly unit: string;
  readonly progressPercentage: number;
}

export interface ListGoalsOutput {
  readonly goals: readonly GoalSummary[];
  readonly total: number;
}

export const listGoalsTool: ToolDefinition<ListGoalsInput, ListGoalsOutput> = {
  id: 'tool_list_goals',
  name: 'list_goals',
  description: 'Lists all goals for the user with their current progress.',
  category: 'goals',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'achieved', 'missed'],
        description: 'Filter by goal status',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of goals to return',
        minimum: 1,
        maximum: 50,
      },
    },
  },
  requiredPermissions: ['goals:read'],
  handler: async (
    input: ListGoalsInput,
    context: ToolExecutionContext,
  ): Promise<ListGoalsOutput> => {
    const userId = context.auth.userId;
    let statusFilter: GoalStatus | undefined;
    if (input.status) {
      if (input.status === 'achieved') statusFilter = GoalStatus.ACHIEVED;
      else if (input.status === 'in_progress') statusFilter = GoalStatus.IN_PROGRESS;
      else if (input.status === 'missed') statusFilter = GoalStatus.FAILED;
      else statusFilter = GoalStatus.NOT_STARTED;
    }

    const res = await goalsRepo.findMany({
      userId,
      status: statusFilter,
      limit: input.limit || 20,
    });

    const summaries: GoalSummary[] = res.data.map((g) => {
      const progressPercentage =
        g.targetValue > 0 ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)) : 0;
      return {
        goalId: g.id,
        title: g.title,
        status: g.status,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        unit: g.unit ?? '',
        progressPercentage,
      };
    });

    return {
      goals: summaries,
      total: res.total,
    };
  },
};

// ─── Update Goal Tool ─────────────────────────────────────────────────────────

export interface UpdateGoalInput extends Record<string, unknown> {
  readonly goalId: string;
  readonly title?: string;
  readonly description?: string;
  readonly progress?: number;
  readonly targetValue?: number;
  readonly status?: 'not_started' | 'in_progress' | 'achieved' | 'missed';
}

export interface UpdateGoalOutput {
  readonly goalId: string;
  readonly updated: boolean;
  readonly currentValue: number;
  readonly status: string;
}

export const updateGoalTool: ToolDefinition<UpdateGoalInput, UpdateGoalOutput> = {
  id: 'tool_update_goal',
  name: 'update_goal',
  description: 'Updates an existing goal or records progress towards it.',
  category: 'goals',
  riskLevel: 'MODIFY',
  inputSchema: {
    type: 'object',
    properties: {
      goalId: { type: 'string', description: 'The ID of the goal to update' },
      title: { type: 'string', description: 'New title' },
      description: { type: 'string', description: 'New description' },
      progress: { type: 'number', description: 'Current numeric progress value' },
      targetValue: { type: 'number', description: 'Target numeric goal value' },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'achieved', 'missed'],
        description: 'Goal status',
      },
    },
    required: ['goalId'],
  },
  requiredPermissions: ['goals:write'],
  handler: async (
    input: UpdateGoalInput,
    _context: ToolExecutionContext,
  ): Promise<UpdateGoalOutput> => {
    let statusFilter: GoalStatus | undefined;
    if (input.status) {
      if (input.status === 'achieved') statusFilter = GoalStatus.ACHIEVED;
      else if (input.status === 'in_progress') statusFilter = GoalStatus.IN_PROGRESS;
      else if (input.status === 'missed') statusFilter = GoalStatus.FAILED;
      else statusFilter = GoalStatus.NOT_STARTED;
    }

    const updated = await goalsService.updateGoal(input.goalId, {
      title: input.title,
      description: input.description,
      currentValue: input.progress,
      targetValue: input.targetValue,
      status: statusFilter,
    });

    return {
      goalId: updated.id,
      updated: true,
      currentValue: updated.currentValue,
      status: updated.status,
    };
  },
  verify: async (
    output: UpdateGoalOutput,
    input: UpdateGoalInput,
  ): Promise<ToolVerificationResult> => {
    const saved = await goalsRepo.findById(output.goalId);
    if (!saved) {
      return {
        verified: false,
        error: `Goal ${output.goalId} not found in database after update.`,
      };
    }
    if (input.progress !== undefined && saved.currentValue !== input.progress) {
      return {
        verified: false,
        error: `Goal progress mismatch: expected ${input.progress}, got ${saved.currentValue}.`,
      };
    }
    return {
      verified: true,
      details: `Goal "${saved.title}" update verified in database (current progress: ${saved.currentValue}/${saved.targetValue} ${saved.unit}).`,
      verifiedObject: saved,
    };
  },
};

// ─── Get Goal Progress Tool ──────────────────────────────────────────────────

export interface GetGoalProgressInput extends Record<string, unknown> {
  readonly goalId?: string;
}

export interface GoalProgressReport {
  readonly totalGoals: number;
  readonly achievedGoals: number;
  readonly inProgressGoals: number;
  readonly averageProgressPercent: number;
  readonly goalSummaries: readonly GoalSummary[];
}

export const getGoalProgressTool: ToolDefinition<GetGoalProgressInput, GoalProgressReport> = {
  id: 'tool_get_goal_progress',
  name: 'get_goal_progress',
  description: 'Calculates real progress toward user goals based on database records.',
  category: 'goals',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      goalId: {
        type: 'string',
        description: 'Optional specific goal ID to calculate progress for',
      },
    },
  },
  requiredPermissions: ['goals:read'],
  handler: async (
    input: GetGoalProgressInput,
    context: ToolExecutionContext,
  ): Promise<GoalProgressReport> => {
    const userId = context.auth.userId;
    const res = await goalsRepo.findMany({ userId, limit: 100 });

    let goals = res.data;
    if (input.goalId) {
      goals = goals.filter((g) => g.id === input.goalId);
      if (goals.length === 0) {
        throw new Error(`Goal with ID "${input.goalId}" not found for progress calculation.`);
      }
    }

    const summaries: GoalSummary[] = goals.map((g) => {
      const progressPercentage =
        g.targetValue > 0 ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)) : 0;
      return {
        goalId: g.id,
        title: g.title,
        status: g.status,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        unit: g.unit ?? '',
        progressPercentage,
      };
    });

    const achieved = summaries.filter(
      (g) => g.status === GoalStatus.ACHIEVED || g.progressPercentage >= 100,
    ).length;
    const inProgress = summaries.filter((g) => g.status === GoalStatus.IN_PROGRESS).length;
    const totalPercent = summaries.reduce((acc, g) => acc + g.progressPercentage, 0);
    const avgPercent = summaries.length > 0 ? Math.round(totalPercent / summaries.length) : 0;

    return {
      totalGoals: summaries.length,
      achievedGoals: achieved,
      inProgressGoals: inProgress,
      averageProgressPercent: avgPercent,
      goalSummaries: summaries,
    };
  },
};

// ─── Delete Goal Tool ────────────────────────────────────────────────────────

export interface DeleteGoalInput extends Record<string, unknown> {
  readonly goalId: string;
}

export interface DeleteGoalOutput {
  readonly goalId: string;
  readonly deleted: boolean;
}

export const deleteGoalTool: ToolDefinition<DeleteGoalInput, DeleteGoalOutput> = {
  id: 'tool_delete_goal',
  name: 'delete_goal',
  description: 'Permanently deletes a goal. Requires user confirmation.',
  category: 'goals',
  riskLevel: 'HIGH_IMPACT',
  requiresConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      goalId: { type: 'string', description: 'The ID of the goal to delete' },
    },
    required: ['goalId'],
  },
  requiredPermissions: ['goals:write'],
  handler: async (
    input: DeleteGoalInput,
    _context: ToolExecutionContext,
  ): Promise<DeleteGoalOutput> => {
    const goal = await goalsRepo.findById(input.goalId);
    if (!goal) {
      throw new Error(`Goal with ID "${input.goalId}" not found.`);
    }

    const deleted = await goalsRepo.delete(input.goalId);
    return {
      goalId: input.goalId,
      deleted,
    };
  },
  verify: async (output: DeleteGoalOutput): Promise<ToolVerificationResult> => {
    const goal = await goalsRepo.findById(output.goalId);
    if (goal !== null && goal !== undefined) {
      return { verified: false, error: `Goal ${output.goalId} still exists after deletion.` };
    }
    return {
      verified: true,
      details: `Goal ${output.goalId} verified as deleted from database.`,
    };
  },
};

// ─── All Goal Tools ──────────────────────────────────────────────────────────

export const goalTools = [
  createGoalTool,
  getGoalTool,
  listGoalsTool,
  updateGoalTool,
  getGoalProgressTool,
  deleteGoalTool,
] as const;

// Auto-register tools on load
for (const tool of goalTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
