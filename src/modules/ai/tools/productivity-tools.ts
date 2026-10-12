/**
 * AETHER AI — Productivity Tools
 * Authoritative tool definitions for productivity analysis and schedules.
 * Queries real database entities for tasks, projects, goals, and logged time.
 */

import type { ToolDefinition, ToolExecutionContext, ToolVerificationResult } from './tool-types.js';
import { toolRegistry } from './tool-registry.js';
import { TasksRepository } from '../../projects/tasks/tasks.repository.js';
import { GoalsRepository } from '../../projects/goals/goals.repository.js';
import { ProjectsRepository } from '../../projects/projects.repository.js';
import { TaskStatus } from '../../projects/projects.constants.js';
import { db } from '../../../database/client.js';

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
  readonly type: 'task' | 'milestone' | 'deadline' | 'calendar_event' | 'planner_block';
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
  description: 'Retrieves tasks, calendar events, planner blocks, and deadlines scheduled for today.',
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
    const dayKey = targetDate.toISOString().split('T')[0] ?? '';

    const [tasksRes, calendarEvents, plannerBlocks] = await Promise.all([
      tasksRepo.findMany({ assigneeId: userId, limit: 100 }),
      db.calendarEvent.findMany({
        where: {
          userId,
          deletedAt: null,
          startDate: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { startDate: 'asc' },
      }).catch(() => []),
      db.plannerBlock.findMany({
        where: {
          userId,
          dayKey,
        },
        orderBy: { start: 'asc' },
      }).catch(() => []),
    ]);

    const todaysTasks = tasksRes.data.filter((t) => {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate);
      return due >= startOfDay && due <= endOfDay;
    });

    const items: ScheduledItem[] = [
      ...plannerBlocks.map((b) => ({
        type: 'planner_block' as const,
        id: b.id,
        title: b.title,
        priority: b.bucket || 'normal',
        status: b.completed ? 'COMPLETED' : 'PENDING',
      })),
      ...calendarEvents.map((e) => ({
        type: 'calendar_event' as const,
        id: e.id,
        title: e.title,
        priority: 'high',
        dueTime: e.startDate.toISOString(),
        status: 'SCHEDULED',
      })),
      ...todaysTasks.map((t) => ({
        type: 'task' as const,
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueTime: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
        status: t.status,
      })),
    ];

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
  readonly activeSession?: {
    id: string;
    type: string;
    durationMinutes: number;
    status: string;
    taskTitle?: string;
  } | null;
  readonly tasksWithLoggedTime: Array<{
    readonly taskId: string;
    readonly title: string;
    readonly loggedMinutes: number;
  }>;
  readonly recentSessions: Array<{
    readonly id: string;
    readonly type: string;
    readonly status: string;
    readonly durationMinutes: number;
    readonly createdAt: string;
  }>;
}

export const getFocusSessionsTool: ToolDefinition<GetFocusSessionsInput, FocusSessionReport> = {
  id: 'tool_get_focus_sessions',
  name: 'get_focus_sessions',
  description: 'Retrieves focus session time logs and active focus session state.',
  category: 'productivity',
  riskLevel: 'READ_ONLY',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        description: 'Maximum number of sessions to inspect',
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
    const [tasksRes, dbSessions] = await Promise.all([
      tasksRepo.findMany({ assigneeId: userId, limit: input.limit || 50 }),
      db.focusSession.findMany({
        where: { userId },
        include: { task: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: input.limit || 20,
      }).catch(() => []),
    ]);

    const active = dbSessions.find((s) => s.status === 'IN_PROGRESS');
    const activeSession = active
      ? {
          id: active.id,
          type: active.type,
          durationMinutes: active.durationMinutes,
          status: active.status,
          taskTitle: active.task?.title,
        }
      : null;

    const recentSessions = dbSessions.map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      durationMinutes: s.durationMinutes,
      createdAt: s.createdAt.toISOString(),
    }));

    const tasksWithTime = tasksRes.data
      .filter((t) => t.loggedMinutes > 0)
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        loggedMinutes: t.loggedMinutes,
      }));

    const totalMinutes =
      tasksWithTime.reduce((sum, t) => sum + t.loggedMinutes, 0) +
      dbSessions
        .filter((s) => s.status === 'COMPLETED')
        .reduce(
          (sum, s) =>
            sum +
            (s.actualDurationSeconds
              ? Math.round(s.actualDurationSeconds / 60)
              : s.durationMinutes),
          0,
        );

    return {
      totalLoggedHours: parseFloat((totalMinutes / 60).toFixed(1)),
      activeSession,
      recentSessions,
      tasksWithLoggedTime: tasksWithTime,
    };
  },
};

// ─── Resolve Workspace Helper ───────────────────────────────────────────────

async function resolveWorkspaceId(userId: string, contextWorkspaceId?: string): Promise<string> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (contextWorkspaceId && isUuid.test(contextWorkspaceId)) {
    return contextWorkspaceId;
  }
  const member = await db.workspaceMember.findFirst({ where: { userId } });
  if (member?.workspaceId) {
    return member.workspaceId;
  }
  const ws = await db.workspace.findFirst({ where: { deletedAt: null } });
  if (ws?.id) {
    return ws.id;
  }
  const newWs = await db.workspace.create({
    data: {
      name: 'Default Workspace',
      slug: `ws-${Date.now().toString(36)}`,
      members: { create: { userId, role: 'OWNER' } },
    },
  });
  return newWs.id;
}

// ─── Create Calendar Event Tool ──────────────────────────────────────────────

export interface CreateCalendarEventInput extends Record<string, unknown> {
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly description?: string;
  readonly location?: string;
  readonly allDay?: boolean;
  readonly projectId?: string;
  readonly taskId?: string;
}

export interface CreateCalendarEventOutput {
  readonly eventId: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly location?: string;
  readonly createdAt: string;
}

export const createCalendarEventTool: ToolDefinition<
  CreateCalendarEventInput,
  CreateCalendarEventOutput
> = {
  id: 'tool_create_calendar_event',
  name: 'create_calendar_event',
  description: 'Creates a calendar event or scheduled meeting in the user calendar.',
  category: 'productivity',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Event title', minLength: 1, maxLength: 255 },
      startDate: { type: 'string', description: 'Start date and time (ISO 8601)' },
      endDate: { type: 'string', description: 'End date and time (ISO 8601)' },
      description: { type: 'string', description: 'Optional description of event' },
      location: { type: 'string', description: 'Location or meeting link' },
      allDay: { type: 'boolean', description: 'Whether event spans all day' },
      projectId: { type: 'string', description: 'Optional associated project ID' },
      taskId: { type: 'string', description: 'Optional associated task ID' },
    },
    required: ['title', 'startDate', 'endDate'],
  },
  requiredPermissions: ['calendar:write'],
  handler: async (
    input: CreateCalendarEventInput,
    context: ToolExecutionContext,
  ): Promise<CreateCalendarEventOutput> => {
    const userId = context.auth.userId;
    const workspaceId = await resolveWorkspaceId(userId, context.auth.workspaceId);

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid ISO date format for startDate or endDate.');
    }
    if (end < start) {
      throw new Error('Event endDate must be greater than or equal to startDate.');
    }

    const event = await db.calendarEvent.create({
      data: {
        workspaceId,
        userId,
        title: input.title,
        description: input.description || null,
        startDate: start,
        endDate: end,
        allDay: !!input.allDay,
        location: input.location || null,
        projectId: input.projectId || null,
        taskId: input.taskId || null,
      },
    });

    return {
      eventId: event.id,
      title: event.title,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      location: event.location || undefined,
      createdAt: event.createdAt.toISOString(),
    };
  },
  verify: async (
    output: CreateCalendarEventOutput,
    _input?: CreateCalendarEventInput,
    _context?: ToolExecutionContext,
  ): Promise<ToolVerificationResult> => {
    const event = await db.calendarEvent.findFirst({
      where: { id: output.eventId, deletedAt: null },
    });
    if (!event) {
      return {
        verified: false,
        error: `Calendar event ${output.eventId} was not found in PostgreSQL.`,
      };
    }
    return {
      verified: true,
      details: `Calendar event "${event.title}" verified in PostgreSQL.`,
      verifiedObject: event,
    };
  },
};

// ─── Update Calendar Event Tool ──────────────────────────────────────────────

export interface UpdateCalendarEventInput extends Record<string, unknown> {
  readonly eventId: string;
  readonly title?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly description?: string;
  readonly location?: string;
}

export interface UpdateCalendarEventOutput {
  readonly eventId: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly updatedAt: string;
}

export const updateCalendarEventTool: ToolDefinition<
  UpdateCalendarEventInput,
  UpdateCalendarEventOutput
> = {
  id: 'tool_update_calendar_event',
  name: 'update_calendar_event',
  description: 'Updates an existing calendar event title, timing, description, or location.',
  category: 'productivity',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Unique calendar event ID' },
      title: { type: 'string', description: 'Updated title' },
      startDate: { type: 'string', description: 'Updated start date (ISO 8601)' },
      endDate: { type: 'string', description: 'Updated end date (ISO 8601)' },
      description: { type: 'string', description: 'Updated description' },
      location: { type: 'string', description: 'Updated location or link' },
    },
    required: ['eventId'],
  },
  requiredPermissions: ['calendar:write'],
  handler: async (
    input: UpdateCalendarEventInput,
    context: ToolExecutionContext,
  ): Promise<UpdateCalendarEventOutput> => {
    const userId = context.auth.userId;
    const roles = context.auth.roles || [];
    const isAdmin = roles.includes('admin') || roles.includes('ADMIN') || roles.includes('SUPERADMIN');

    const existing = await db.calendarEvent.findFirst({
      where: { id: input.eventId, deletedAt: null },
    });
    if (!existing) {
      throw new Error(`Calendar event "${input.eventId}" not found.`);
    }
    if (existing.userId !== userId && !isAdmin) {
      throw new Error(`Access denied: Calendar event "${input.eventId}" belongs to another user.`);
    }

    const updated = await db.calendarEvent.update({
      where: { id: input.eventId },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
      },
    });

    return {
      eventId: updated.id,
      title: updated.title,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
  verify: async (
    output: UpdateCalendarEventOutput,
    input: UpdateCalendarEventInput,
  ): Promise<ToolVerificationResult> => {
    const event = await db.calendarEvent.findFirst({
      where: { id: output.eventId, deletedAt: null },
    });
    if (!event) {
      return { verified: false, error: `Calendar event ${output.eventId} not found after update.` };
    }
    if (input.title && event.title !== input.title) {
      return { verified: false, error: `Calendar event title was not updated in database.` };
    }
    return {
      verified: true,
      details: `Calendar event "${event.title}" update verified in PostgreSQL.`,
      verifiedObject: event,
    };
  },
};

// ─── Create Reminder Tool ────────────────────────────────────────────────────

export interface CreateReminderInput extends Record<string, unknown> {
  readonly title: string;
  readonly message: string;
  readonly dueDate?: string;
  readonly link?: string;
}

export interface CreateReminderOutput {
  readonly reminderId: string;
  readonly title: string;
  readonly message: string;
  readonly createdAt: string;
}

export const createReminderTool: ToolDefinition<CreateReminderInput, CreateReminderOutput> = {
  id: 'tool_create_reminder',
  name: 'create_reminder',
  description: 'Creates a reminder or notification for a user in the workspace.',
  category: 'productivity',
  riskLevel: 'LOW_RISK',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Reminder title', minLength: 1, maxLength: 255 },
      message: { type: 'string', description: 'Reminder description or alert details', minLength: 1 },
      dueDate: { type: 'string', description: 'Optional reminder due date (ISO 8601)' },
      link: { type: 'string', description: 'Optional resource link associated with the reminder' },
    },
    required: ['title', 'message'],
  },
  requiredPermissions: ['notifications:write'],
  handler: async (
    input: CreateReminderInput,
    context: ToolExecutionContext,
  ): Promise<CreateReminderOutput> => {
    const userId = context.auth.userId;

    const notif = await db.notification.create({
      data: {
        userId,
        title: input.title,
        message: input.message,
        type: 'SYSTEM',
        metadata: {
          reminder: true,
          dueDate: input.dueDate || null,
        },
        link: input.link || null,
      },
    });

    return {
      reminderId: notif.id,
      title: notif.title,
      message: notif.message,
      createdAt: notif.createdAt.toISOString(),
    };
  },
  verify: async (output: CreateReminderOutput): Promise<ToolVerificationResult> => {
    const notif = await db.notification.findUnique({
      where: { id: output.reminderId },
    });
    if (!notif) {
      return {
        verified: false,
        error: `Reminder notification ${output.reminderId} was not found in database.`,
      };
    }
    return {
      verified: true,
      details: `Reminder "${notif.title}" verified in PostgreSQL.`,
      verifiedObject: notif,
    };
  },
};

// ─── All Productivity Tools ──────────────────────────────────────────────────

export const productivityTools = [
  getProductivitySummaryTool,
  getTodaysScheduleTool,
  getFocusSessionsTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  createReminderTool,
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

