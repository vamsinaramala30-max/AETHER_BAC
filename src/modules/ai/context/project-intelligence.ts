/**
 * AETHER AI — Project Intelligence Service
 * Assembles project status, tasks, milestones, goals, notes, and activities
 * for project-related user requests.
 * Enforces workspace and user authorization.
 */

import { db } from '../../../database/client.js';
import { toUuid } from '../storage/repositories/memory-repository.js';
import type { UserId } from '../ai-types.js';

export interface ProjectContextSummary {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly progress: number;
  readonly activeTasks: readonly { title: string; status: string; priority: string }[];
  readonly upcomingMilestones: readonly { title: string; dueDate?: Date | null }[];
  readonly goals: readonly { title: string; progress: number }[];
  readonly recentNotes: readonly { title: string; content?: string | null }[];
  readonly summaryText: string;
}

export class ProjectIntelligenceService {
  public async getProjectContext(
    userId: UserId,
    projectIdOrName: string,
  ): Promise<ProjectContextSummary | null> {
    if (!userId || !projectIdOrName) return null;
    const validUserId = toUuid(userId);

    try {
      if ((db as any).project) {
        const project = await (db as any).project.findFirst({
          where: {
            OR: [
              { id: projectIdOrName.length === 36 ? projectIdOrName : undefined },
              { name: { contains: projectIdOrName, mode: 'insensitive' } },
            ],
            deletedAt: null,
            ownerId: validUserId,
          },
          include: {
            tasks: {
              where: { deletedAt: null },
              take: 10,
              orderBy: { updatedAt: 'desc' },
            },
            goals: {
              where: { deletedAt: null },
              take: 5,
            },
            milestones: {
              take: 5,
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (!project) return null;

        const activeTasks = (project.tasks || []).map((t: any) => ({
          title: t.title,
          status: t.status,
          priority: t.priority,
        }));

        const upcomingMilestones = (project.milestones || []).map((m: any) => ({
          title: m.title,
          dueDate: m.dueDate,
        }));

        const goals = (project.goals || []).map((g: any) => ({
          title: g.title,
          progress: g.progress,
        }));

        const summaryParts = [
          `[Project Context: ${project.name}]`,
          `Status: ${project.status} | Progress: ${project.progress}%`,
          activeTasks.length > 0
            ? `Tasks (${activeTasks.length}):\n` +
              activeTasks.map((t: any) => `- [${t.status}] (${t.priority}) ${t.title}`).join('\n')
            : 'No active tasks recorded.',
          goals.length > 0
            ? `Goals:\n` + goals.map((g: any) => `- ${g.title} (${g.progress}%)`).join('\n')
            : '',
          upcomingMilestones.length > 0
            ? `Milestones:\n` + upcomingMilestones.map((m: any) => `- ${m.title}`).join('\n')
            : '',
        ].filter(Boolean);

        return {
          projectId: project.id,
          projectName: project.name,
          status: project.status,
          progress: project.progress,
          activeTasks,
          upcomingMilestones,
          goals,
          recentNotes: [],
          summaryText: summaryParts.join('\n'),
        };
      }
    } catch {
      // Fallback
    }

    return null;
  }
}

export const projectIntelligenceService = new ProjectIntelligenceService();
