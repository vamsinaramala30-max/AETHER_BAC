import { SearchRepository } from './search.repository';
import { GlobalSearchDto } from './search.dto';
import { SearchResultItem } from './search.entity';
import { SearchType } from '../knowledge.constants';
import { db } from '../../../database/client';
import { defaultRAGEngine } from '../../ai/rag/rag-engine';

export class SearchService {
  constructor(private readonly searchRepository: SearchRepository) {}

  async search(
    dto: GlobalSearchDto,
    userId: string,
    workspaceId?: string,
  ): Promise<{ results: SearchResultItem[]; aiAnswer?: string }> {
    if (!userId) {
      return { results: [], aiAnswer: 'No matching records found.' };
    }

    // Non-blocking background history record to eliminate query latency
    this.searchRepository.recordSearch(
      userId,
      dto.query,
      dto.searchType || SearchType.HYBRID,
    ).catch(() => {});

    const q = dto.query.trim().toLowerCase();
    if (!q) {
      return { results: [], aiAnswer: 'Please enter a search query.' };
    }

    const results: SearchResultItem[] = [];

    // Resolve user's accessible workspaces for tenant isolation
    const memberships = await db.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true },
    });
    const allUserWorkspaceIds = memberships.map((m) => m.workspaceId);

    // If specific workspace requested, user must be a member
    if (workspaceId && !allUserWorkspaceIds.includes(workspaceId)) {
      return {
        results: [],
        aiAnswer: `No matching records found for "${dto.query}".`,
      };
    }

    const userWorkspaceIds = workspaceId
      ? allUserWorkspaceIds.filter((id) => id === workspaceId)
      : allUserWorkspaceIds;

    // Parallel multi-entity queries bounded with take: 5 each to prevent table scans
    const [
      notes,
      tasks,
      projects,
      files,
      calendarEvents,
      plannerBlocks,
      automations,
      workspaces,
    ] = await Promise.all([
      // 1. Notes (User boundary)
      db.note.findMany({
        where: {
          userId,
          deletedAt: null,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),

      // 2. Tasks (Assignee, Creator, or accessible workspace)
      db.task.findMany({
        where: {
          deletedAt: null,
          AND: [
            {
              OR: [
                { assigneeId: userId },
                { creatorId: userId },
                ...(userWorkspaceIds.length > 0 ? [{ workspaceId: { in: userWorkspaceIds } }] : []),
              ],
            },
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        include: { project: { select: { id: true, name: true } } },
        take: 5,
      }),

      // 3. Projects (Owner or accessible workspace)
      db.project.findMany({
        where: {
          deletedAt: null,
          AND: [
            {
              OR: [
                { ownerId: userId },
                ...(userWorkspaceIds.length > 0 ? [{ workspaceId: { in: userWorkspaceIds } }] : []),
              ],
            },
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        take: 5,
      }),

      // 4. Files (Owner or accessible workspace)
      db.file.findMany({
        where: {
          deletedAt: null,
          isTrash: false,
          AND: [
            {
              OR: [
                { userId },
                ...(userWorkspaceIds.length > 0 ? [{ workspaceId: { in: userWorkspaceIds } }] : []),
              ],
            },
            {
              OR: [
                { filename: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        take: 5,
      }),

      // 5. Calendar Events (User or accessible workspace)
      db.calendarEvent.findMany({
        where: {
          deletedAt: null,
          AND: [
            {
              OR: [
                { userId },
                ...(userWorkspaceIds.length > 0 ? [{ workspaceId: { in: userWorkspaceIds } }] : []),
              ],
            },
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { location: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        take: 5,
      }),

      // 6. Planner Blocks (User boundary)
      db.plannerBlock.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { subject: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),

      // 7. Automations (User or accessible workspace)
      db.automation.findMany({
        where: {
          deletedAt: null,
          AND: [
            {
              OR: [
                { userId },
                ...(userWorkspaceIds.length > 0 ? [{ workspaceId: { in: userWorkspaceIds } }] : []),
              ],
            },
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
          ],
        },
        take: 5,
      }),

      // 8. Workspaces (Memberships only)
      userWorkspaceIds.length > 0
        ? db.workspace.findMany({
            where: {
              id: { in: userWorkspaceIds },
              deletedAt: null,
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q, mode: 'insensitive' } },
              ],
            },
            take: 3,
          })
        : Promise.resolve([]),
    ]);

    // Format Notes results
    for (const note of notes) {
      results.push({
        id: note.id,
        type: 'NOTE',
        title: note.title,
        snippet: (note.content || '').slice(0, 200),
        score: note.title.toLowerCase().includes(q) ? 0.95 : 0.8,
        href: `/app/knowledge/notes`,
        metadata: { category: note.category, updatedAt: note.updatedAt },
      });
    }

    // Format Tasks results
    for (const task of tasks) {
      results.push({
        id: task.id,
        type: 'TASK',
        title: task.title,
        snippet: task.description ? task.description.slice(0, 200) : `Status: ${task.status} | Priority: ${task.priority}`,
        score: task.title.toLowerCase().includes(q) ? 0.95 : 0.8,
        href: `/app/projects/tasks?taskId=${task.id}`,
        metadata: { status: task.status, priority: task.priority, projectName: task.project?.name },
      });
    }

    // Format Projects results
    for (const project of projects) {
      results.push({
        id: project.id,
        type: 'PROJECT',
        title: project.name,
        snippet: project.description ? project.description.slice(0, 200) : `Status: ${project.status} | Priority: ${project.priority}`,
        score: project.name.toLowerCase().includes(q) ? 0.98 : 0.85,
        href: `/app/projects?projectId=${project.id}`,
        metadata: { status: project.status, priority: project.priority },
      });
    }

    // Format Files results
    for (const file of files) {
      results.push({
        id: file.id,
        type: 'FILE',
        title: file.filename,
        snippet: file.description || `MIME: ${file.mimeType} | Size: ${(file.size / 1024).toFixed(1)} KB`,
        score: file.filename.toLowerCase().includes(q) ? 0.92 : 0.78,
        href: `/app/projects/files?fileId=${file.id}`,
        metadata: { mimeType: file.mimeType, size: file.size },
      });
    }

    // Format Calendar Events results
    for (const event of calendarEvents) {
      results.push({
        id: event.id,
        type: 'CALENDAR',
        title: event.title,
        snippet: event.description || (event.startDate ? `Starts: ${new Date(event.startDate).toISOString().replace('T', ' ').slice(0, 16)}` : 'Calendar Event'),
        score: event.title.toLowerCase().includes(q) ? 0.93 : 0.8,
        href: `/app/workspace/calendar`,
        metadata: { startDate: event.startDate, location: event.location },
      });
    }

    // Format Planner Blocks results
    for (const block of plannerBlocks) {
      results.push({
        id: block.id,
        type: 'PLANNER',
        title: block.title || (block as any).label || 'Planner Block',
        snippet: block.subject || `Day: ${block.dayKey || ''} | Bucket: ${block.bucket || 'general'}`,
        score: ((block.title || (block as any).label || '')).toLowerCase().includes(q) ? 0.91 : 0.77,
        href: `/app/workspace/weeklyplanner`,
        metadata: { dayKey: block.dayKey, bucket: block.bucket },
      });
    }

    // Format Automation results
    for (const auto of automations) {
      results.push({
        id: auto.id,
        type: 'AUTOMATION',
        title: auto.name,
        snippet: auto.description || `Trigger: ${auto.trigger} | Status: ${auto.status}`,
        score: auto.name.toLowerCase().includes(q) ? 0.94 : 0.79,
        href: `/app/automation`,
        metadata: { trigger: auto.trigger, status: auto.status },
      });
    }

    // Format Workspace results
    for (const ws of workspaces) {
      results.push({
        id: ws.id,
        type: 'WORKSPACE',
        title: ws.name,
        snippet: ws.description || `Slug: ${ws.slug}`,
        score: ws.name.toLowerCase().includes(q) ? 0.97 : 0.82,
        href: `/app/workspace`,
        metadata: { slug: ws.slug },
      });
    }

    // 9. Semantic knowledge search via RAGEngine
    try {
      const ragResult = await defaultRAGEngine.query({
        text: dto.query,
        userId,
        workspaceId,
        topK: 5,
        scoreThreshold: 0.1,
      });

      if (ragResult.ok) {
        for (const doc of ragResult.value.documents) {
          results.push({
            id: doc.documentId,
            type: 'DOCUMENT',
            title: doc.citation?.title || (doc.metadata as any)?.title || 'Knowledge Document',
            snippet: doc.citation?.excerpt || doc.content.slice(0, 200),
            score: doc.score,
            href: `/app/knowledge/documents`,
            metadata: doc.metadata as any,
          });
        }
      }
    } catch {
      // Graceful RAG degradation
    }

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);

    const countsByType: Record<string, number> = {};
    for (const r of results) {
      countsByType[r.type] = (countsByType[r.type] || 0) + 1;
    }
    const breakdown = Object.entries(countsByType)
      .map(([type, count]) => `${count} ${type.toLowerCase()}(s)`)
      .join(', ');

    const aiAnswer =
      results.length > 0
        ? `Found ${results.length} record(s) matching "${dto.query}" (${breakdown}).`
        : `No matching records found for "${dto.query}".`;

    return {
      results,
      aiAnswer,
    };
  }

  async getSuggestions(query: string): Promise<string[]> {
    if (!query) return [];
    return [`${query} in backend`, `${query} guidelines`, `${query} architecture`].slice(0, 5);
  }
}
