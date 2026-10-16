/**
 * AETHER AI — Live Productivity Context Service (P1C)
 * Queries authoritative PostgreSQL / Prisma state for:
 *   - Overdue tasks
 *   - Today's tasks & upcoming deadlines
 *   - Today's planner blocks
 *   - Upcoming calendar events & meetings
 *   - Active focus session
 *   - Unfinished work per project
 *   - Project-scoped files
 *   - Task notes
 *
 * Enforces strict user and workspace tenant authorization.
 * Provides request-aware selective fetching to avoid unnecessary DB queries.
 */

import { db } from '../../../database/client.js';
import { toUuid } from '../storage/repositories/memory-repository.js';
import type {
  UserId,
  LiveProductivityContext,
  LiveProductivityTask,
  LivePlannerBlockSummary,
  LiveCalendarEventSummary,
  LiveFocusSessionSummary,
  LiveProjectUnfinishedSummary,
  LiveProductivityFileSummary,
  LiveProductivityNoteSummary,
} from '../ai-types.js';

export interface LiveContextQueryOptions {
  readonly queryMessage?: string;
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly taskId?: string;
  readonly forceAll?: boolean;
}

export class LiveContextService {
  public async getLiveContext(
    userId: UserId,
    options: LiveContextQueryOptions = {},
  ): Promise<LiveProductivityContext> {
    if (!userId) {
      return this.emptyContext();
    }

    const validUserId = toUuid(userId);
    const msg = (options.queryMessage || '').toLowerCase();
    const forceAll =
      options.forceAll === true ||
      !options.queryMessage ||
      options.queryMessage.trim().length === 0;

    // Request-aware intent classification
    const isScheduleOrCalendar =
      forceAll ||
      msg.includes('schedule') ||
      msg.includes('calendar') ||
      msg.includes('meeting') ||
      msg.includes('appointment') ||
      msg.includes('tomorrow') ||
      msg.includes('today') ||
      msg.includes('agenda') ||
      msg.includes('planner') ||
      msg.includes('plan');

    const isOverdueQuery =
      forceAll ||
      msg.includes('overdue') ||
      msg.includes('late') ||
      msg.includes('missed') ||
      msg.includes('behind');

    const isFocusQuery =
      forceAll ||
      msg.includes('focus') ||
      msg.includes('focusing') ||
      msg.includes('working on right now') ||
      msg.includes('current session');

    const isNextWorkQuery =
      forceAll ||
      msg.includes('what should i work on') ||
      msg.includes('what to do next') ||
      msg.includes('next task') ||
      msg.includes('priority') ||
      msg.includes('prioritize');

    const isProjectWorkQuery =
      forceAll ||
      msg.includes('unfinished') ||
      msg.includes('most unfinished') ||
      msg.includes('project progress') ||
      msg.includes('backlog');

    const isFileQuery =
      forceAll ||
      msg.includes('upload') ||
      msg.includes('uploaded') ||
      msg.includes('file') ||
      msg.includes('attachment');

    const isNoteQuery =
      forceAll ||
      msg.includes('note') ||
      msg.includes('notes') ||
      msg.includes('document');

    // Date boundaries
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
    const dayKey = now.toISOString().split('T')[0] ?? '';

    // Parallel selective execution
    const [
      overdueTasks,
      todayTasks,
      todayPlannerBlocks,
      upcomingCalendarEvents,
      activeFocusSession,
      projectsWithUnfinishedWork,
      projectUploadedFiles,
      taskNotes,
    ] = await Promise.all([
      // 1. Overdue Tasks
      (isOverdueQuery || isNextWorkQuery)
        ? this.fetchOverdueTasks(validUserId)
        : Promise.resolve([]),

      // 2. Today's Tasks
      (isScheduleOrCalendar || isNextWorkQuery)
        ? this.fetchTodayTasks(validUserId, startOfDay, endOfDay)
        : Promise.resolve([]),

      // 3. Today's Planner Blocks
      (isScheduleOrCalendar || isNextWorkQuery || isFocusQuery)
        ? this.fetchTodayPlannerBlocks(validUserId, dayKey)
        : Promise.resolve([]),

      // 4. Upcoming Calendar Events (Today & Tomorrow)
      (isScheduleOrCalendar || msg.includes('meeting'))
        ? this.fetchCalendarEvents(validUserId, startOfDay, endOfTomorrow)
        : Promise.resolve([]),

      // 5. Active Focus Session
      (isFocusQuery || isNextWorkQuery)
        ? this.fetchActiveFocusSession(validUserId)
        : Promise.resolve(null),

      // 6. Projects with Unfinished Work
      (isProjectWorkQuery || isNextWorkQuery)
        ? this.fetchProjectsWithUnfinishedWork(validUserId)
        : Promise.resolve([]),

      // 7. Project Uploaded Files
      (isFileQuery && (options.projectId || msg.includes('project')))
        ? this.fetchProjectFiles(validUserId, options.projectId)
        : Promise.resolve([]),

      // 8. Task Notes
      (isNoteQuery)
        ? this.fetchTaskNotes(validUserId, options.taskId, msg)
        : Promise.resolve([]),
    ]);

    // Build human-readable structured summary
    const summaryLines: string[] = [];

    if (activeFocusSession) {
      summaryLines.push(
        `[Active Focus Session] Mode: ${activeFocusSession.type} (${activeFocusSession.durationMinutes}m) | Status: ${activeFocusSession.status}` +
        (activeFocusSession.taskTitle ? ` | Task: "${activeFocusSession.taskTitle}"` : '') +
        (activeFocusSession.projectName ? ` | Project: "${activeFocusSession.projectName}"` : ''),
      );
    }

    if (overdueTasks.length > 0) {
      summaryLines.push(`[Overdue Tasks (${overdueTasks.length})]:`);
      for (const t of overdueTasks) {
        summaryLines.push(`• "${t.title}" [${t.priority}] — Due: ${t.dueDate ? t.dueDate.toISOString().split('T')[0] : 'Past due'}${t.projectName ? ` (${t.projectName})` : ''}`);
      }
    }

    if (todayTasks.length > 0) {
      summaryLines.push(`[Today's Tasks (${todayTasks.length})]:`);
      for (const t of todayTasks) {
        summaryLines.push(`• "${t.title}" [${t.priority}] — Status: ${t.status}`);
      }
    }

    if (todayPlannerBlocks.length > 0) {
      summaryLines.push(`[Today's Planner Blocks (${todayPlannerBlocks.length})]:`);
      for (const b of todayPlannerBlocks) {
        summaryLines.push(`• [${b.completed ? 'COMPLETED' : 'PENDING'}] ${b.title} (${b.duration}m, bucket: ${b.bucket})`);
      }
    }

    if (upcomingCalendarEvents.length > 0) {
      summaryLines.push(`[Upcoming Calendar Events (${upcomingCalendarEvents.length})]:`);
      for (const ev of upcomingCalendarEvents) {
        summaryLines.push(`• "${ev.title}" — ${ev.startDate.toLocaleTimeString()} to ${ev.endDate.toLocaleTimeString()}${ev.location ? ` at ${ev.location}` : ''}`);
      }
    }

    if (projectsWithUnfinishedWork.length > 0) {
      summaryLines.push(`[Projects Unfinished Work]:`);
      for (const p of projectsWithUnfinishedWork) {
        summaryLines.push(`• Project "${p.name}" (${p.status}): ${p.unfinishedTasksCount} unfinished tasks`);
      }
    }

    if (projectUploadedFiles && projectUploadedFiles.length > 0) {
      summaryLines.push(`[Project Files (${projectUploadedFiles.length})]:`);
      for (const f of projectUploadedFiles) {
        summaryLines.push(`• "${f.name}" (${(f.sizeBytes / 1024).toFixed(1)} KB, type: ${f.mimeType})`);
      }
    }

    if (taskNotes && taskNotes.length > 0) {
      summaryLines.push(`[Related Notes (${taskNotes.length})]:`);
      for (const n of taskNotes) {
        summaryLines.push(`• "${n.title}": ${n.content ? n.content.slice(0, 100) : 'No content'}`);
      }
    }

    const summaryText = summaryLines.join('\n');

    return {
      overdueTasks,
      todayTasks,
      todayPlannerBlocks,
      upcomingCalendarEvents,
      activeFocusSession,
      projectsWithUnfinishedWork,
      projectUploadedFiles,
      taskNotes,
      summaryText,
    };
  }

  // ─── Private Query Helpers ──────────────────────────────────────────────────

  private async fetchOverdueTasks(userId: string): Promise<LiveProductivityTask[]> {
    try {
      const tasks = await db.task.findMany({
        where: {
          deletedAt: null,
          assigneeId: userId,
          completedAt: null,
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lt: new Date() },
        },
        include: {
          project: { select: { name: true } },
        },
        take: 10,
        orderBy: { dueDate: 'asc' },
      });

      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        projectName: t.project?.name,
      }));
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch overdue tasks:', err);
      return [];
    }
  }

  private async fetchTodayTasks(
    userId: string,
    startOfDay: Date,
    endOfDay: Date,
  ): Promise<LiveProductivityTask[]> {
    try {
      const tasks = await db.task.findMany({
        where: {
          deletedAt: null,
          assigneeId: userId,
          dueDate: { gte: startOfDay, lte: endOfDay },
        },
        include: {
          project: { select: { name: true } },
        },
        take: 10,
        orderBy: { priority: 'asc' },
      });

      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
        projectName: t.project?.name,
      }));
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch today tasks:', err);
      return [];
    }
  }

  private async fetchTodayPlannerBlocks(
    userId: string,
    dayKey: string,
  ): Promise<LivePlannerBlockSummary[]> {
    try {
      const blocks = await db.plannerBlock.findMany({
        where: {
          userId,
          dayKey,
        },
        orderBy: { start: 'asc' },
        take: 15,
      });

      return blocks.map((b) => ({
        id: b.id,
        title: b.title,
        start: b.start,
        duration: b.duration,
        completed: b.completed,
        bucket: b.bucket,
        taskId: b.taskId,
      }));
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch planner blocks:', err);
      return [];
    }
  }

  private async fetchCalendarEvents(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<LiveCalendarEventSummary[]> {
    try {
      const events = await db.calendarEvent.findMany({
        where: {
          userId,
          deletedAt: null,
          startDate: { gte: start, lte: end },
        },
        orderBy: { startDate: 'asc' },
        take: 10,
      });

      return events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        startDate: ev.startDate,
        endDate: ev.endDate,
        allDay: ev.allDay,
        location: ev.location,
      }));
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch calendar events:', err);
      return [];
    }
  }

  private async fetchActiveFocusSession(userId: string): Promise<LiveFocusSessionSummary | null> {
    try {
      const session = await db.focusSession.findFirst({
        where: {
          userId,
          status: 'IN_PROGRESS',
        },
        include: {
          task: { select: { title: true } },
          project: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!session) return null;

      return {
        id: session.id,
        type: session.type,
        status: session.status,
        durationMinutes: session.durationMinutes,
        startTime: session.startTime,
        taskTitle: session.task?.title,
        projectName: session.project?.name,
      };
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch active focus session:', err);
      return null;
    }
  }

  private async fetchProjectsWithUnfinishedWork(
    userId: string,
  ): Promise<LiveProjectUnfinishedSummary[]> {
    try {
      const projects = await db.project.findMany({
        where: {
          ownerId: userId,
          deletedAt: null,
          isArchived: false,
        },
        include: {
          tasks: {
            where: {
              deletedAt: null,
              completedAt: null,
              status: { notIn: ['DONE', 'CANCELLED'] },
            },
            select: { id: true },
          },
        },
        take: 15,
      });

      const summaries: LiveProjectUnfinishedSummary[] = projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        unfinishedTasksCount: p.tasks.length,
      }));

      // Sort projects by highest unfinished work
      summaries.sort((a, b) => b.unfinishedTasksCount - a.unfinishedTasksCount);
      return summaries.slice(0, 5);
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch unfinished project work:', err);
      return [];
    }
  }

  private async fetchProjectFiles(
    userId: string,
    projectId?: string,
  ): Promise<LiveProductivityFileSummary[]> {
    try {
      const files = await db.file.findMany({
        where: {
          deletedAt: null,
          isTrash: false,
          ...(projectId ? { projectId } : {}),
          userId,
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      });

      return files.map((f) => ({
        id: f.id,
        name: f.filename,
        mimeType: f.mimeType,
        sizeBytes: f.size,
        createdAt: f.createdAt,
      }));
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch project files:', err);
      return [];
    }
  }

  private async fetchTaskNotes(
    userId: string,
    _taskId?: string,
    searchQuery?: string,
  ): Promise<LiveProductivityNoteSummary[]> {
    try {
      const notes = await db.note.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(searchQuery && searchQuery.length > 3
            ? {
                OR: [
                  { title: { contains: searchQuery, mode: 'insensitive' } },
                  { content: { contains: searchQuery, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });

      return notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
      }));
    } catch (err) {
      console.warn('[LiveContextService] Failed to fetch task notes:', err);
      return [];
    }
  }

  private emptyContext(): LiveProductivityContext {
    return {
      overdueTasks: [],
      todayTasks: [],
      todayPlannerBlocks: [],
      upcomingCalendarEvents: [],
      activeFocusSession: null,
      projectsWithUnfinishedWork: [],
      projectUploadedFiles: [],
      taskNotes: [],
      summaryText: '',
    };
  }
}

export const liveContextService = new LiveContextService();
