import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../database/client';

const router = Router();

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // Get user's active workspace
    const membership = await db.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    });

    const workspaceId = req.user?.workspaceId || membership?.workspaceId;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [
      activeProjectsCount,
      aiChatsTodayCount,
      tasksDueCount,
      knowledgeDocsCount,
      recentProjects,
      recentConversations,
      todayEvents,
      recentActivity,
      unreadNotificationsCount,
    ] = await Promise.all([
      db.project.count({
        where: { ownerId: userId, status: 'ACTIVE', deletedAt: null },
      }),
      db.conversation.count({
        where: { userId, updatedAt: { gte: startOfToday }, deletedAt: null },
      }),
      db.task.count({
        where: {
          assigneeId: userId,
          status: { not: 'DONE' },
          deletedAt: null,
        },
      }),
      db.knowledgeBase.count({
        where: workspaceId ? { workspaceId } : { workspace: { members: { some: { userId } } } },
      }),
      db.project.findMany({
        where: { ownerId: userId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          tasks: { select: { id: true, status: true } },
        },
      }),
      db.conversation.findMany({
        where: { userId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          messages: { select: { id: true } },
        },
      }),
      db.calendarEvent.findMany({
        where: {
          userId,
          deletedAt: null,
          startDate: { lte: endOfToday },
          endDate: { gte: startOfToday },
        },
        orderBy: { startDate: 'asc' },
      }),
      db.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.notification.count({
        where: { userId, isRead: false },
      }),
    ]);

    const formattedProjects = recentProjects.map((p) => {
      const totalTasks = p.tasks.length;
      const completedTasks = p.tasks.filter((t) => t.status === 'DONE').length;
      const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : p.progress || 0;
      return {
        id: p.id,
        name: p.name,
        progress,
        taskCount: totalTasks,
        color: p.color || 'from-indigo-500 to-purple-500',
        category: p.category || 'General',
        updatedAt: p.updatedAt,
      };
    });

    const formattedChats = recentConversations.map((c) => {
      const diffMs = Date.now() - new Date(c.updatedAt).getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const timeStr = diffHours < 1 ? 'Just now' : diffHours < 24 ? `${diffHours}h ago` : `${Math.floor(diffHours / 24)}d ago`;

      return {
        id: c.id,
        title: c.title,
        time: timeStr,
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      };
    });

    const formattedEvents = todayEvents.map((e) => {
      const startTime = new Date(e.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return {
        id: e.id,
        title: e.title,
        time: e.allDay ? 'All day' : startTime,
        type: e.projectId ? 'meeting' : 'task',
      };
    });

    res.status(200).json({
      success: true,
      data: {
        stats: {
          activeProjects: activeProjectsCount,
          aiChatsToday: aiChatsTodayCount,
          tasksDue: tasksDueCount,
          knowledgeDocs: knowledgeDocsCount,
          unreadNotifications: unreadNotificationsCount,
        },
        chats: formattedChats,
        projects: formattedProjects,
        events: formattedEvents,
        activity: recentActivity,
        workspace: membership?.workspace
          ? {
              id: membership.workspace.id,
              name: membership.workspace.name,
              plan: membership.workspace.plan,
              storageUsedMb: membership.workspace.storageUsedMb,
              storageLimitMb: membership.workspace.storageLimitMb,
            }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

export const dashboardRoutes: Router = router;
