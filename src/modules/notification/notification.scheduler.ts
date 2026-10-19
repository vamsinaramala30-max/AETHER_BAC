import { NotificationService } from './notification.service';
import { CronScheduler } from '../../cron/scheduler';
import { db } from '../../database/client';
import { logger } from '../../config';

/**
 * Checks approaching and overdue tasks and dispatches reminder notifications.
 * Can be run manually or triggered by the scheduler.
 */
export async function checkTaskReminders(service: NotificationService): Promise<number> {
  const now = new Date();
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    // 1. Query active tasks with upcoming due dates or overdue
    const upcomingTasks = await db.task.findMany({
      where: {
        deletedAt: null,
        status: {
          notIn: ['DONE', 'CANCELLED'],
        },
        dueDate: {
          not: null,
          lte: next24Hours,
        },
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
      take: 100,
    });

    let dispatchedCount = 0;

    for (const task of upcomingTasks) {
      if (!task.dueDate) continue;

      const recipientId = task.assigneeId || task.creatorId;
      if (!recipientId) continue;

      const isOverdue = task.dueDate < now;
      const formattedDue = task.dueDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      // Avoid spamming: Check if a notification for this task was already sent in the last 20 hours
      const existingNotif = await db.notification.findFirst({
        where: {
          userId: recipientId,
          createdAt: {
            gte: oneDayAgo,
          },
          metadata: {
            path: ['taskId'],
            equals: task.id,
          },
        },
      });

      if (existingNotif) {
        continue;
      }

      const projectName = (task as any).project?.name || 'Workspace';
      const title = isOverdue
        ? `Task Overdue: ${task.title}`
        : `Task Due Soon: ${task.title}`;

      const message = isOverdue
        ? `Task "${task.title}" in ${projectName} was due on ${formattedDue}.`
        : `Task "${task.title}" in ${projectName} is due on ${formattedDue}.`;

      await service.createNotification({
        userId: recipientId,
        title,
        message,
        type: 'TASK',
        link: `/ya/projects/tasks?taskId=${task.id}`,
        metadata: {
          taskId: task.id,
          projectId: task.projectId,
          dueDate: task.dueDate.toISOString(),
          isOverdue,
          kind: 'due_reminder',
        },
      });

      dispatchedCount++;
    }

    if (dispatchedCount > 0) {
      logger.info(`[NotificationScheduler] Dispatched ${dispatchedCount} task due reminder notifications.`);
    }

    return dispatchedCount;
  } catch (error) {
    logger.error('[NotificationScheduler] Error during task reminder check:', error);
    return 0;
  }
}

/**
 * Dispatches weekly summary digest to active users on Sunday.
 */
export async function dispatchWeeklyDigest(service: NotificationService): Promise<number> {
  try {
    const activeUsers = await db.user.findMany({
      where: {
        deletedAt: null,
      },
      select: { id: true, email: true, fullName: true },
      take: 200,
    });

    let digestCount = 0;

    for (const user of activeUsers) {
      const [pendingTasksCount, openProjectsCount] = await Promise.all([
        db.task.count({
          where: {
            deletedAt: null,
            assigneeId: user.id,
            status: { notIn: ['DONE', 'CANCELLED'] },
          },
        }),
        db.project.count({
          where: {
            deletedAt: null,
            ownerId: user.id,
            status: 'ACTIVE',
          },
        }),
      ]);

      if (pendingTasksCount === 0 && openProjectsCount === 0) {
        continue;
      }

      await service.createNotification({
        userId: user.id,
        title: 'Weekly Productivity Digest',
        message: `You have ${pendingTasksCount} pending task${pendingTasksCount === 1 ? '' : 's'} across ${openProjectsCount} active project${openProjectsCount === 1 ? '' : 's'} ready for this week.`,
        type: 'SYSTEM',
        link: '/ya/dashboard',
        metadata: {
          kind: 'weekly_digest',
          pendingTasksCount,
          openProjectsCount,
        },
      });

      digestCount++;
    }

    logger.info(`[NotificationScheduler] Dispatched ${digestCount} weekly productivity digests.`);
    return digestCount;
  } catch (error) {
    logger.error('[NotificationScheduler] Error during weekly digest dispatch:', error);
    return 0;
  }
}

/**
 * Registers recurring notification crons with CronScheduler.
 */
export function setupNotificationScheduler(service: NotificationService) {
  const scheduler = CronScheduler.getInstance();

  // Task Due Reminder Cron — runs every 15 minutes
  scheduler.schedule({
    name: 'notification-task-due-reminders',
    expression: '*/15 * * * *',
    handler: async () => {
      await checkTaskReminders(service);
    },
  });

  // Weekly Digest Cron — runs every Sunday at midnight (00:00)
  scheduler.schedule({
    name: 'notification-weekly-digest',
    expression: '0 0 * * 0',
    handler: async () => {
      await dispatchWeeklyDigest(service);
    },
  });

  logger.info('[NotificationScheduler] Task reminders & weekly digest scheduled successfully.');
}
