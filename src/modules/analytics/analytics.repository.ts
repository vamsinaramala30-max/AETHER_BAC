import { PrismaClient } from '@prisma/client';
import { DateRangeFilter, GoalAnalyticsDetail, RawAggregateMetrics } from './analytics.types';

export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async getRawMetrics(userId: string, range: DateRangeFilter): Promise<RawAggregateMetrics> {
    const { startDate, endDate } = range;
    const scopedUserId = this.isUuid(userId) ? userId : undefined;

    const [projects, conversations, messages, notifications, files, auditLogs, sessions, tokenAggregation] = await Promise.all([
      this.prisma.project.count({
        where: scopedUserId
          ? {
              ownerId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
      }),
      this.prisma.conversation.count({
        where: scopedUserId
          ? {
              userId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
      }),
      this.prisma.message.count({
        where: scopedUserId
          ? {
              senderId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
      }),
      this.prisma.notification.count({
        where: scopedUserId
          ? {
              userId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
      }),
      this.prisma.file.count({
        where: scopedUserId
          ? {
              userId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
      }),
      this.prisma.auditLog.count({
        where: scopedUserId
          ? {
              userId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
      }),
      this.prisma.session.count({
        where: scopedUserId
          ? {
              userId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
      }),
      this.prisma.message.aggregate({
        where: scopedUserId
          ? {
              senderId: scopedUserId,
              createdAt: { gte: startDate, lte: endDate },
            }
          : {
              createdAt: { gte: startDate, lte: endDate },
            },
        _sum: { tokensUsed: true },
      }),
    ]);

    const totalTasks = projects + conversations;
    const completedTasks = Math.max(0, Math.min(totalTasks, Math.round(conversations * 0.7)));

    const totalTrackedSeconds = Math.max(0, messages * 25 * 60);
    const focusSeconds = Math.max(0, messages * 20 * 60);
    const breakSeconds = Math.max(0, notifications * 5 * 60);
    const meetingSeconds = Math.max(0, files * 15 * 60);
    const learningSeconds = Math.max(0, conversations * 10 * 60);
    const personalProjectSeconds = Math.max(0, projects * 30 * 60);

    return {
      totalTasks,
      completedTasks,
      pendingTasks: Math.max(0, totalTasks - completedTasks),
      totalTrackedSeconds,
      focusSeconds,
      breakSeconds,
      meetingSeconds,
      learningSeconds,
      personalProjectSeconds,
      activeGoals: Math.max(0, projects),
      completedGoals: 0,
      totalMilestones: Math.max(0, projects),
      completedMilestones: 0,
      aiPromptsCount: messages,
      aiTokensUsed: tokenAggregation._sum.tokensUsed ?? 0,
      workspaceEventsCount: auditLogs,
      sessionCount: sessions,
    };
  }

  public async getGoalsDetail(userId: string, limit: number): Promise<GoalAnalyticsDetail[]> {
    const scopedUserId = this.isUuid(userId) ? userId : undefined;
    const projects = await this.prisma.project.findMany({
      where: scopedUserId
        ? {
            ownerId: scopedUserId,
            deletedAt: null,
          }
        : {
            deletedAt: null,
          },
      take: limit,
      include: { conversations: true },
      orderBy: { updatedAt: 'desc' },
    });

    return projects.map((project) => {
      const totalMilestones = project.conversations.length;
      const completedMilestones = project.conversations.filter((conversation) => conversation.deletedAt !== null).length;
      const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

      return {
        id: project.id,
        title: project.name,
        category: 'Project',
        progress,
        targetDate: project.updatedAt.toISOString().split('T')[0],
        milestonesCount: totalMilestones,
        completedMilestonesCount: completedMilestones,
      };
    });
  }

  public async getDailyTaskAggregates(userId: string, days: number): Promise<Array<{ date: string; completed: number; pending: number }>> {
    const result: Array<{ date: string; completed: number; pending: number }> = [];
    const scopedUserId = this.isUuid(userId) ? userId : undefined;

    for (let index = days - 1; index >= 0; index -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - index);
      day.setHours(0, 0, 0, 0);

      const startOfDay = new Date(day);
      const endOfDay = new Date(day);
      endOfDay.setHours(23, 59, 59, 999);

      const [projectsCreated, conversationsCreated] = await Promise.all([
        this.prisma.project.count({
          where: scopedUserId
            ? {
                ownerId: scopedUserId,
                createdAt: { gte: startOfDay, lte: endOfDay },
              }
            : {
                createdAt: { gte: startOfDay, lte: endOfDay },
              },
        }),
        this.prisma.conversation.count({
          where: scopedUserId
            ? {
                userId: scopedUserId,
                createdAt: { gte: startOfDay, lte: endOfDay },
              }
            : {
                createdAt: { gte: startOfDay, lte: endOfDay },
              },
        }),
      ]);

      result.push({
        date: startOfDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        completed: projectsCreated,
        pending: Math.max(0, conversationsCreated - projectsCreated),
      });
    }

    return result;
  }

  private isUuid(value: string): boolean {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(value);
  }
}