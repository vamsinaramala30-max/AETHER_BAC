import { PrismaClient } from '@prisma/client';
import { ActionConfig } from '../automation.types';
import { VariableEngine } from './variable-engine';
import { AIAdapter } from '../integrations/ai/ai.adapter';
import { TasksAdapter } from '../integrations/tasks/tasks.adapter';
import { ProjectsAdapter } from '../integrations/projects/projects.adapter';
import { CalendarAdapter } from '../integrations/calendar/calendar.adapter';
import { KnowledgeAdapter } from '../integrations/knowledge/knowledge.adapter';
import { FilesAdapter } from '../integrations/files/files.adapter';
import { NotificationsAdapter } from '../integrations/notifications/notifications.adapter';
import { AgentsAdapter } from '../integrations/agents/agents.adapter';
import { logger } from '../../../config';

export class ActionEngine {
  private aiAdapter: AIAdapter;
  private tasksAdapter: TasksAdapter;
  private projectsAdapter: ProjectsAdapter;
  private calendarAdapter: CalendarAdapter;
  private knowledgeAdapter: KnowledgeAdapter;
  private filesAdapter: FilesAdapter;
  private notificationsAdapter: NotificationsAdapter;
  private agentsAdapter: AgentsAdapter;

  constructor(prisma: PrismaClient) {
    this.aiAdapter = new AIAdapter();
    this.tasksAdapter = new TasksAdapter(prisma);
    this.projectsAdapter = new ProjectsAdapter(prisma);
    this.calendarAdapter = new CalendarAdapter(prisma);
    this.knowledgeAdapter = new KnowledgeAdapter(prisma);
    this.filesAdapter = new FilesAdapter(prisma);
    this.notificationsAdapter = new NotificationsAdapter(prisma);
    this.agentsAdapter = new AgentsAdapter();
  }

  public async executeAction(
    action: ActionConfig,
    context: Record<string, unknown>,
  ): Promise<unknown> {
    const rawParams = action.params || {};
    const params = VariableEngine.interpolate(rawParams, context) as Record<string, unknown>;
    const type = String(action.type).toUpperCase().trim();

    logger.info(`[ActionEngine] Executing action type '${type}'`, { params });

    switch (type) {
      // ─── AI Actions ──────────────────────────────────────────────────────────
      case 'AI_ASK':
      case 'ASK_AETHER':
      case 'AI':
        return this.aiAdapter.askAether(
          String(params.prompt || params.text || 'Process request'),
          context,
        );

      case 'AI_SUMMARIZE':
      case 'SUMMARIZE':
        return this.aiAdapter.summarizeText(
          String(params.text || params.content || ''),
          Number(params.maxLength || 300),
        );

      case 'AI_ANALYZE':
      case 'ANALYZE':
        return this.aiAdapter.analyze(
          String(params.text || params.content || ''),
          params.focusArea ? String(params.focusArea) : undefined,
        );

      case 'AI_CLASSIFY':
      case 'CLASSIFY':
        return this.aiAdapter.classify(
          String(params.text || params.content || ''),
          Array.isArray(params.categories)
            ? params.categories.map(String)
            : ['Category A', 'Category B'],
        );

      case 'AI_GENERATE':
      case 'GENERATE':
        return this.aiAdapter.askAether(
          `Generate content for: ${String(params.prompt || params.topic || '')}`,
          context,
        );

      case 'AI_EXTRACT':
      case 'EXTRACT':
        return this.aiAdapter.extract(
          String(params.text || params.content || ''),
          Array.isArray(params.entities) ? params.entities.map(String) : ['name', 'email', 'date'],
        );

      case 'AI_TRANSFORM':
      case 'TRANSFORM':
        return this.aiAdapter.transform(
          String(params.text || params.content || ''),
          String(params.targetFormat || 'JSON'),
        );

      // ─── Task Actions ────────────────────────────────────────────────────────
      case 'TASK_CREATE':
      case 'CREATE_TASK':
        return this.tasksAdapter.createTask({
          title: String(params.title || 'New Automated Task'),
          description: params.description ? String(params.description) : undefined,
          projectId: params.projectId ? String(params.projectId) : undefined,
          assigneeId: params.assigneeId ? String(params.assigneeId) : String(context.userId || ''),
          priority: params.priority ? String(params.priority) : 'MEDIUM',
          dueDate: params.dueDate ? String(params.dueDate) : undefined,
        });

      case 'TASK_UPDATE':
      case 'UPDATE_TASK':
        return this.tasksAdapter.updateTask(
          String(params.taskId || params.id),
          params.updates ? (params.updates as Record<string, unknown>) : params,
        );

      case 'TASK_COMPLETE':
      case 'COMPLETE_TASK':
        return this.tasksAdapter.completeTask(String(params.taskId || params.id));

      case 'TASK_SET_PRIORITY':
      case 'SET_TASK_PRIORITY':
        return this.tasksAdapter.setPriority(
          String(params.taskId || params.id),
          String(params.priority || 'MEDIUM'),
        );

      case 'TASK_SET_DEADLINE':
      case 'SET_TASK_DEADLINE':
        return this.tasksAdapter.setDeadline(
          String(params.taskId || params.id),
          String(params.dueDate || params.deadline),
        );

      // ─── Project Actions ─────────────────────────────────────────────────────
      case 'PROJECT_CREATE':
      case 'CREATE_PROJECT':
        return this.projectsAdapter.createProject({
          name: String(params.name || 'New Project'),
          description: params.description ? String(params.description) : undefined,
          workspaceId: String(params.workspaceId || context.workspaceId || '00000000-0000-0000-0000-000000000000'),
          ownerId: String(params.ownerId || context.userId || '00000000-0000-0000-0000-000000000000'),
        });

      case 'PROJECT_UPDATE':
      case 'UPDATE_PROJECT':
        return this.projectsAdapter.updateProject(
          String(params.projectId || params.id),
          params,
        );

      case 'PROJECT_ADD_TASK':
        return this.tasksAdapter.createTask({
          title: String(params.title || 'Project Task'),
          projectId: String(params.projectId),
          assigneeId: params.assigneeId ? String(params.assigneeId) : String(context.userId || ''),
        });

      case 'PROJECT_UPDATE_GOAL':
      case 'UPDATE_GOAL':
        return this.projectsAdapter.updateGoal(
          String(params.goalId || params.id),
          params,
        );

      case 'PROJECT_CREATE_MILESTONE':
      case 'CREATE_MILESTONE':
        return this.projectsAdapter.createMilestone({
          projectId: String(params.projectId),
          title: String(params.title || 'Milestone'),
          description: params.description ? String(params.description) : undefined,
          dueDate: params.dueDate ? String(params.dueDate) : undefined,
        });

      // ─── Calendar Actions ────────────────────────────────────────────────────
      case 'CALENDAR_CREATE_EVENT':
      case 'CREATE_CALENDAR_EVENT':
        return this.calendarAdapter.createEvent({
          workspaceId: String(params.workspaceId || context.workspaceId || '00000000-0000-0000-0000-000000000000'),
          userId: String(params.userId || context.userId || '00000000-0000-0000-0000-000000000000'),
          title: String(params.title || 'Automated Event'),
          description: params.description ? String(params.description) : undefined,
          startDate: String(params.startDate || new Date().toISOString()),
          endDate: String(params.endDate || new Date(Date.now() + 3600000).toISOString()),
          location: params.location ? String(params.location) : undefined,
        });

      case 'CALENDAR_CREATE_REMINDER':
        return this.calendarAdapter.createReminder({
          workspaceId: String(params.workspaceId || context.workspaceId || '00000000-0000-0000-0000-000000000000'),
          userId: String(params.userId || context.userId || '00000000-0000-0000-0000-000000000000'),
          title: String(params.title || 'Reminder'),
          reminderTime: String(params.reminderTime || params.time || new Date().toISOString()),
        });

      // ─── Knowledge Actions ───────────────────────────────────────────────────
      case 'KNOWLEDGE_CREATE_ITEM':
      case 'CREATE_KNOWLEDGE':
        return this.knowledgeAdapter.createKnowledgeItem({
          workspaceId: String(params.workspaceId || context.workspaceId || '00000000-0000-0000-0000-000000000000'),
          title: String(params.title || 'Automated Knowledge Item'),
          content: String(params.content || ''),
        });

      case 'KNOWLEDGE_SAVE_AI_RESULT':
        return this.knowledgeAdapter.saveAIResult({
          workspaceId: String(params.workspaceId || context.workspaceId || '00000000-0000-0000-0000-000000000000'),
          title: String(params.title || 'AI Generated Insights'),
          aiResponse: String(params.aiResponse || params.content || ''),
        });

      case 'KNOWLEDGE_TAG':
        return this.knowledgeAdapter.tagKnowledge(
          String(params.knowledgeId || params.id),
          Array.isArray(params.tags) ? params.tags.map(String) : [],
        );

      // ─── File Actions ────────────────────────────────────────────────────────
      case 'FILE_ORGANIZE':
      case 'ORGANIZE_FILE':
        return this.filesAdapter.organizeFile(
          String(params.fileId || params.id),
          String(params.folderId),
        );

      case 'FILE_RENAME':
      case 'RENAME_FILE':
        return this.filesAdapter.renameFile(
          String(params.fileId || params.id),
          String(params.newName || params.name),
        );

      // ─── Notification Actions ────────────────────────────────────────────────
      case 'NOTIFICATION_CREATE':
      case 'SEND_NOTIFICATION':
        return this.notificationsAdapter.createNotification({
          userId: String(params.userId || context.userId || '00000000-0000-0000-0000-000000000000'),
          title: String(params.title || 'Automation Notification'),
          message: String(params.message || 'Notification content'),
          link: params.link ? String(params.link) : undefined,
        });

      case 'NOTIFICATION_REMINDER':
        return this.notificationsAdapter.createReminder({
          userId: String(params.userId || context.userId || '00000000-0000-0000-0000-000000000000'),
          title: String(params.title || 'Task Reminder'),
          message: String(params.message || 'Reminder details'),
        });

      // ─── Agent Actions ───────────────────────────────────────────────────────
      case 'AGENT_RUN':
      case 'RUN_AGENT':
        return this.agentsAdapter.runAgent({
          agentId: String(params.agentId || 'general_agent'),
          task: String(params.task || params.prompt || 'Perform workflow step'),
          context,
        });

      default:
        logger.warn(`[ActionEngine] Unhandled action type '${type}'. Executing generic parameters payload.`);
        return {
          status: 'SUCCESS',
          actionType: type,
          executedParams: params,
        };
    }
  }
}
