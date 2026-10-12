import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const isUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val));

function toUuid(id: string): string {
  if (isUuid(id)) return id;
  const hash = crypto.createHash('md5').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function migrateFileTrash() {
  console.log('[Migration] Starting file trash state migration...');
  const files = await prisma.file.findMany();
  let migratedCount = 0;

  for (const file of files) {
    if (file.description && file.description.startsWith('__TRASH__')) {
      const parts = file.description.split('::');
      let trashedAt: Date = file.updatedAt;
      if (parts[1]) {
        const parsed = new Date(parts[1]);
        if (!isNaN(parsed.getTime())) {
          trashedAt = parsed;
        }
      }
      let folderId = file.folderId;
      if (parts[2] && parts[2] !== 'root' && isUuid(parts[2])) {
        // Check if folder actually exists
        const folderExists = await prisma.folder.findUnique({ where: { id: parts[2] } });
        if (folderExists) {
          folderId = parts[2];
        }
      }

      await prisma.file.update({
        where: { id: file.id },
        data: {
          isTrash: true,
          deletedAt: trashedAt,
          folderId,
          description: null, // Clear internal string marker
        },
      });
      migratedCount++;
    } else if (file.isTrash === undefined || file.isTrash === null) {
      await prisma.file.update({
        where: { id: file.id },
        data: {
          isTrash: false,
          deletedAt: null,
        },
      });
    }
  }
  console.log(`[Migration] Migrated ${migratedCount} trashed files to structured isTrash/deletedAt state.`);
}

async function migrateFocusSessions() {
  console.log('[Migration] Starting focus sessions migration from activity logs...');
  const logs = await prisma.activityLog.findMany({
    where: { entityType: 'FOCUS_SESSION' },
  });
  let migratedCount = 0;

  for (const log of logs) {
    const meta = (log.metadata && typeof log.metadata === 'object' ? log.metadata : {}) as Record<string, any>;
    const sessionId = isUuid(log.entityId) ? log.entityId : toUuid(log.id);
    
    // Check if already migrated
    const existing = await prisma.focusSession.findUnique({ where: { id: sessionId } });
    if (!existing) {
      // Validate user
      const user = await prisma.user.findUnique({ where: { id: log.userId } });
      if (!user) continue;

      let validWsId: string | null = null;
      if (log.workspaceId && isUuid(log.workspaceId)) {
        const ws = await prisma.workspace.findUnique({ where: { id: log.workspaceId } });
        if (ws) validWsId = ws.id;
      }

      let validTaskId: string | null = null;
      if (meta.taskId && isUuid(meta.taskId)) {
        const task = await prisma.task.findUnique({ where: { id: meta.taskId } });
        if (task) validTaskId = task.id;
      }

      let validProjId: string | null = null;
      if (meta.projectId && isUuid(meta.projectId)) {
        const proj = await prisma.project.findUnique({ where: { id: meta.projectId } });
        if (proj) validProjId = proj.id;
      }

      await prisma.focusSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          workspaceId: validWsId,
          projectId: validProjId,
          taskId: validTaskId,
          type: meta.type || 'focus',
          status: meta.status || 'COMPLETED',
          durationMinutes: typeof meta.durationMinutes === 'number' ? meta.durationMinutes : 25,
          actualDurationSeconds: typeof meta.actualDurationSeconds === 'number' ? meta.actualDurationSeconds : 0,
          distractionsCount: typeof meta.distractionsCount === 'number' ? meta.distractionsCount : 0,
          startTime: meta.startTime ? new Date(meta.startTime) : log.createdAt,
          endTime: meta.endTime ? new Date(meta.endTime) : log.createdAt,
          createdAt: log.createdAt,
          updatedAt: log.createdAt,
        },
      });
      migratedCount++;
    }
  }
  console.log(`[Migration] Migrated ${migratedCount} focus sessions to relational FocusSession model.`);
}

async function migratePlannerBlocks() {
  console.log('[Migration] Starting planner blocks migration from userSettings displayPreferences...');
  const allSettings = await prisma.userSettings.findMany();
  let migratedCount = 0;

  for (const s of allSettings) {
    const prefs = (s.displayPreferences && typeof s.displayPreferences === 'object' ? s.displayPreferences : {}) as Record<string, any>;
    const weeklyPlanner = prefs.weeklyPlanner || {};
    const daysData = weeklyPlanner.daysData || {};

    for (const [dayKey, dayVal] of Object.entries(daysData)) {
      const d = dayVal as any;
      if (!d || !Array.isArray(d.blocks)) continue;

      for (let i = 0; i < d.blocks.length; i++) {
        const b = d.blocks[i];
        if (!b) continue;

        const blockId = isUuid(b.id) ? b.id : toUuid(`planner_${s.userId}_${dayKey}_${b.id || i}`);
        const existing = await prisma.plannerBlock.findUnique({ where: { id: blockId } });
        if (!existing) {
          let validTaskId: string | null = null;
          if (b.taskId && isUuid(b.taskId)) {
            const task = await prisma.task.findUnique({ where: { id: b.taskId } });
            if (task) validTaskId = task.id;
          }

          let validCalendarEventId: string | null = null;
          if (b.calendarEventId && isUuid(b.calendarEventId)) {
            const ce = await prisma.calendarEvent.findUnique({ where: { id: b.calendarEventId } });
            if (ce) validCalendarEventId = ce.id;
          }

          await prisma.plannerBlock.create({
            data: {
              id: blockId,
              userId: s.userId,
              dayKey,
              title: b.label || 'Untitled Block',
              start: typeof b.start === 'number' ? b.start : 0,
              duration: typeof b.duration === 'number' ? b.duration : 30,
              bucket: b.bucket || 'other',
              kind: b.kind || 'flexible',
              subject: b.subject || null,
              priority: b.priority || null,
              energy: b.energy || null,
              revision: b.revision || undefined,
              groupId: b.groupId || null,
              completed: Boolean(b.completed),
              position: i,
              taskId: validTaskId,
              calendarEventId: validCalendarEventId,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          migratedCount++;
        }
      }
    }
  }
  console.log(`[Migration] Migrated ${migratedCount} planner blocks to relational PlannerBlock model.`);
}

async function main() {
  try {
    await migrateFileTrash();
    await migrateFocusSessions();
    await migratePlannerBlocks();
    console.log('[Migration] All P1A data migrations completed successfully! ✅');
  } catch (err: any) {
    console.error('[Migration] Failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
