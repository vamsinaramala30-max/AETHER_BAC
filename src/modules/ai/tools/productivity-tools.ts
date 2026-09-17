/**
 * AETHER AI — Productivity Tools
 * Authoritative tool definitions for productivity analysis and schedules.
 * Queries real database entities for tasks, projects, goals, and logged time.
 */

import type { ToolDefinition, ToolExecutionContext } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { TasksRepository } from '../../projects/tasks/tasks.repository.js';
import { GoalsRepository } from '../../projects/goals/goals.repository.js';
import { ProjectsRepository } from '../../projects/projects.repository.js';
import { TaskStatus } from '../../projects/projects.constants.js';

const tasksRepo = new TasksRepository();
const goalsRepo = new GoalsRepository();
const projectsRepo = new ProjectsRepository();

// ─── Get Productivity Summary Tool ───────────────────────────────────────────

export interface GetProductivitySummaryInput extends Record<string, unknown> {
  readonly timeRange?: 'today' | 'this_week' | 'all_time';
}

export interface ProductivitySummaryReport {
  readonly timeRange: string;
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly pendingTasks: number;
  readonly completionRate: number;
  readonly activeProjects: number;
  readonly activeGoals: number;
  readonly loggedMinutes: number;
  readonly generatedAt: string;
}

export const getProductivitySummaryTool: ToolDefinition<
  GetProductivitySummaryInput,
  ProductivitySummaryReport
> = {
  id: 'tool_get_productivity_summary',
  name: 'get_productivity_summary',
  description:
    'Retrieves actual productivity metrics including task completions, active projects, goals, and logged hours.',
  category: 'productivity',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      timeRange: {
        type: 'string',
        enum: ['today', 'this_week', 'all_time'],
        description: 'Time window for productivity metrics',
      },
    },
  },
  requiredPermissions: ['tasks:read'],
  handler: async (
    input: GetProductivitySummaryInput,
    context: ToolExecutionContext,
  ): Promise<ProductivitySummaryReport> => {
    const userId = context.auth.userId;
    const timeRange = input.timeRange || 'all_time';

    const [tasksRes, goalsRes, projectsRes] = await Promise.all([
      tasksRepo.findMany({ assigneeId: userId, limit: 200 }),
      goalsRepo.findMany({ userId, limit: 100 }),
      projectsRepo.findMany({ ownerId: userId, limit: 100 }),
    ]);

    const allTasks = tasksRes.data;
    const completedTasks = allTasks.filter((t) => t.isCompleted || t.status === TaskStatus.DONE);
    const pendingTasks = allTasks.filter(
      (t) => !t.isCompleted && t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED,
    );
    const completionRate =
      allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 0;
    const loggedMinutes = allTasks.reduce((sum, t) => sum + (t.loggedMinutes || 0), 0);

    return {
      timeRange,
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      pendingTasks: pendingTasks.length,
      completionRate,
      activeProjects: projectsRes.data.filter((p) => !p.isArchived).length,
      activeGoals: goalsRes.data.filter((g) => !g.isCompleted).length,
      loggedMinutes,
      generatedAt: new Date().toISOString(),
    };
  },
};

// ─── Get Today's Schedule Tool ───────────────────────────────────────────────

export interface GetTodaysScheduleInput extends Record<string, unknown> {
  readonly date?: string;
}

export interface ScheduledItem {
  readonly type: 'task' | 'milestone' | 'deadline';
  readonly id: string;
  readonly title: string;
  readonly priority: string;
  readonly dueTime?: string;
  readonly status: string;
}

export interface TodaysScheduleReport {
  readonly targetDate: string;
  readonly items: readonly ScheduledItem[];
  readonly totalItems: number;
}

export const getTodaysScheduleTool: ToolDefinition<GetTodaysScheduleInput, TodaysScheduleReport> = {
  id: 'tool_get_todays_schedule',
  name: 'get_todays_schedule',
  description: 'Retrieves tasks, deadlines, and milestones scheduled for today.',
  category: 'productivity',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Target date in YYYY-MM-DD or ISO 8601 format (defaults to current date)',
      },
    },
  },
  requiredPermissions: ['tasks:read'],
  handler: async (
    input: GetTodaysScheduleInput,
    context: ToolExecutionContext,
  ): Promise<TodaysScheduleReport> => {
    const userId = context.auth.userId;
    const targetDate = input.date ? new Date(input.date) : new Date();
    const startOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );
    const endOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      23,
      59,
      59,
      999,
    );

    const tasksRes = await tasksRepo.findMany({ assigneeId: userId, limit: 100 });
    const todaysTasks = tasksRes.data.filter((t) => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      return due >= startOfDay && due <= endOfDay;
    });

    const items: ScheduledItem[] = todaysTasks.map((t) => ({
      type: 'task',
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueTime: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
      status: t.status,
    }));

    return {
      targetDate: startOfDay.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0]!,
      items,
      totalItems: items.length,
    };
  },
};

// ─── Get Focus Sessions Tool ─────────────────────────────────────────────────

export interface GetFocusSessionsInput extends Record<string, unknown> {
  readonly limit?: number;
}

export interface FocusSessionReport {
  readonly totalLoggedHours: number;
  readonly tasksWithLoggedTime: Array<{
    readonly taskId: string;
    readonly title: string;
    readonly loggedMinutes: number;
  }>;
}

export const getFocusSessionsTool: ToolDefinition<GetFocusSessionsInput, FocusSessionReport> = {
  id: 'tool_get_focus_sessions',
  name: 'get_focus_sessions',
  description: 'Retrieves focus session time logs across user tasks.',
  category: 'productivity',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum number of tasks to inspect',
        minimum: 1,
        maximum: 50,
      },
    },
  },
  requiredPermissions: ['tasks:read'],
  handler: async (
    input: GetFocusSessionsInput,
    context: ToolExecutionContext,
  ): Promise<FocusSessionReport> => {
    const userId = context.auth.userId;
    const tasksRes = await tasksRepo.findMany({ assigneeId: userId, limit: input.limit || 50 });

    const tasksWithTime = tasksRes.data
      .filter((t) => t.loggedMinutes > 0)
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        loggedMinutes: t.loggedMinutes,
      }));

    const totalMinutes = tasksWithTime.reduce((sum, t) => sum + t.loggedMinutes, 0);

    return {
      totalLoggedHours: parseFloat((totalMinutes / 60).toFixed(1)),
      tasksWithLoggedTime: tasksWithTime,
    };
  },
};

// ─── All Productivity Tools ──────────────────────────────────────────────────

export const productivityTools = [
  getProductivitySummaryTool,
  getTodaysScheduleTool,
  getFocusSessionsTool,
] as const;

// Auto-register tools on load
for (const tool of productivityTools) {
  try {
    if (!toolRegistry.has(tool.name)) {
      toolRegistry.register(tool as any);
    }
  } catch {
    // Already registered
  }
}
