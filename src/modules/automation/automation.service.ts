import { PrismaClient, AutomationStatus } from '@prisma/client';
import { db } from '../../database/client';
import { AutomationRepository } from './repositories/automation.repository';
import { ExecutionRepository } from './repositories/execution.repository';
import { ActivityRepository } from './repositories/activity.repository';
import { ExecutionEngine } from './engine/execution-engine';
import { AutomationScheduler } from './scheduler/automation-scheduler';
import { AutomationWorker } from './workers/automation-worker';
import { AppError } from '../../middleware/error.middleware';
import { CreateAutomationInput, UpdateAutomationInput, AutomationTemplate } from './automation.types';
import { isValidUuid } from './utils/automation.utils';
import { logger } from '../../config';

export class AutomationService {
  private autoRepo: AutomationRepository;
  private execRepo: ExecutionRepository;
  private actRepo: ActivityRepository;
  private executionEngine: ExecutionEngine;
  private scheduler: AutomationScheduler;
  private worker: AutomationWorker;

  constructor(prisma: PrismaClient = db) {
    this.autoRepo = new AutomationRepository();
    this.execRepo = new ExecutionRepository();
    this.actRepo = new ActivityRepository();
    this.executionEngine = new ExecutionEngine(prisma);
    this.scheduler = new AutomationScheduler(prisma);
    this.worker = new AutomationWorker(prisma);

    // Initialize scheduled automations
    this.scheduler.initializeScheduledAutomations();
  }

  public async createAutomation(input: CreateAutomationInput) {
    if (!input.name || !input.name.trim()) {
      throw new AppError('Automation name is required', 400, 'VALIDATION_ERROR');
    }

    const created = await this.autoRepo.create(input);

    await this.actRepo.logActivity(
      created.id,
      created.workspaceId,
      'AUTOMATION_CREATED',
      `Automation '${created.name}' was created`,
      null,
      input.userId || null,
    );

    if (created.schedule) {
      this.scheduler.scheduleAutomation(created.id, created.name, created.schedule);
    }

    return created;
  }

  public async getAutomations(workspaceId: string, page: number = 1, limit: number = 50) {
    return this.autoRepo.findByWorkspaceId(workspaceId, page, limit);
  }

  public async getUserAutomations(userId: string, page: number = 1, limit: number = 50) {
    return this.autoRepo.findByUserId(userId, page, limit);
  }

  public async getAutomationById(id: string) {
    if (!isValidUuid(id)) {
      throw new AppError('Invalid automation ID format', 400, 'INVALID_ID');
    }

    const auto = await this.autoRepo.findById(id);
    if (!auto) {
      throw new AppError('Automation rule not found', 404, 'AUTOMATION_NOT_FOUND');
    }
    return auto;
  }

  public async updateAutomation(id: string, input: UpdateAutomationInput, userId?: string) {
    const auto = await this.getAutomationById(id);

    const updated = await this.autoRepo.update(id, input);

    await this.actRepo.logActivity(
      auto.id,
      auto.workspaceId,
      'AUTOMATION_UPDATED',
      `Automation '${updated.name}' was updated`,
      null,
      userId || null,
    );

    if (input.schedule !== undefined || input.isEnabled !== undefined) {
      if (updated.isEnabled && updated.schedule) {
        this.scheduler.scheduleAutomation(updated.id, updated.name, updated.schedule);
      } else {
        this.scheduler.unscheduleAutomation(updated.id);
      }
    }

    return updated;
  }

  public async deleteAutomation(id: string, userId?: string) {
    const auto = await this.getAutomationById(id);

    this.scheduler.unscheduleAutomation(id);
    await this.autoRepo.softDelete(id);

    await this.actRepo.logActivity(
      auto.id,
      auto.workspaceId,
      'AUTOMATION_DELETED',
      `Automation '${auto.name}' was deleted`,
      null,
      userId || null,
    );

    return { message: 'Automation deleted successfully' };
  }

  public async activateAutomation(id: string, userId?: string) {
    const auto = await this.getAutomationById(id);

    const updated = await this.autoRepo.update(id, {
      isEnabled: true,
      status: AutomationStatus.ACTIVE,
    });

    if (updated.schedule) {
      this.scheduler.scheduleAutomation(updated.id, updated.name, updated.schedule);
    }

    await this.actRepo.logActivity(
      auto.id,
      auto.workspaceId,
      'AUTOMATION_ACTIVATED',
      `Automation '${auto.name}' was activated`,
      null,
      userId || null,
    );

    return updated;
  }

  public async pauseAutomation(id: string, userId?: string) {
    const auto = await this.getAutomationById(id);

    const updated = await this.autoRepo.update(id, {
      isEnabled: false,
      status: AutomationStatus.PAUSED,
    });

    this.scheduler.unscheduleAutomation(id);

    await this.actRepo.logActivity(
      auto.id,
      auto.workspaceId,
      'AUTOMATION_PAUSED',
      `Automation '${auto.name}' was paused`,
      null,
      userId || null,
    );

    return updated;
  }

  public async runAutomation(id: string, triggerData?: Record<string, unknown>, userId?: string) {
    const auto = await this.getAutomationById(id);

    logger.info(`[AutomationService] Manually triggering automation '${id}' for user ${userId || 'system'}`);

    // Queue for background execution to prevent blocking HTTP response
    await this.worker.queueExecution(auto.id, triggerData, userId);

    return {
      message: 'Automation execution queued successfully',
      automationId: auto.id,
      status: 'QUEUED',
      triggeredAt: new Date().toISOString(),
    };
  }

  public async getAutomationActivity(automationId: string, page: number = 1, limit: number = 50) {
    await this.getAutomationById(automationId);
    return this.actRepo.findByAutomationId(automationId, page, limit);
  }

  public async getAllActivity(options: {
    workspaceId?: string;
    userId?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return this.actRepo.findAll(options);
  }

  public async getExecutions(automationId: string, page: number = 1, limit: number = 20) {
    await this.getAutomationById(automationId);
    return this.execRepo.findByAutomationId(automationId, page, limit);
  }

  public async approveExecution(executionId: string, userId?: string) {
    const success = await this.executionEngine.approveExecution(executionId, userId);
    if (!success) {
      throw new AppError('Pending execution not found or already processed', 404, 'EXECUTION_NOT_FOUND');
    }
    return { message: 'Execution step approved and resumed' };
  }

  public async rejectExecution(executionId: string, reason?: string) {
    const success = await this.executionEngine.rejectExecution(executionId, reason);
    if (!success) {
      throw new AppError('Pending execution not found or already processed', 404, 'EXECUTION_NOT_FOUND');
    }
    return { message: 'Execution step rejected and cancelled' };
  }

  public getTemplates(): AutomationTemplate[] {
    return [
      {
        id: 'tpl_daily_digest',
        name: 'Daily AI Work Digest & Summarizer',
        description: 'Summarizes daily tasks, milestones, and events every morning at 8 AM',
        category: 'ai',
        icon: 'Sparkles',
        trigger: { type: 'SCHEDULE', schedule: '0 8 * * *' },
        actions: [
          { type: 'AI_SUMMARIZE', params: { text: 'Daily task progress' } },
          { type: 'NOTIFICATION_CREATE', params: { title: 'Your Daily Digest Is Ready' } },
        ],
      },
      {
        id: 'tpl_task_auto_assign',
        name: 'Auto-Organize Urgent Tasks',
        description: 'Automatically elevates priority and sets reminders for overdue high priority tasks',
        category: 'tasks',
        icon: 'CheckSquare',
        trigger: { type: 'TASK_OVERDUE' },
        actions: [
          { type: 'TASK_SET_PRIORITY', params: { priority: 'URGENT' } },
          { type: 'NOTIFICATION_REMINDER', params: { title: 'Overdue Task Alert' } },
        ],
      },
      {
        id: 'tpl_calendar_sync',
        name: 'Auto-Create Calendar Meetings for Milestones',
        description: 'Creates a calendar event whenever a project milestone is created',
        category: 'calendar',
        icon: 'Calendar',
        trigger: { type: 'PROJECT_CREATED' },
        actions: [
          { type: 'CALENDAR_CREATE_EVENT', params: { title: 'Kickoff Meeting' } },
        ],
      },
      {
        id: 'tpl_knowledge_indexer',
        name: 'AI Document Knowledge Base Indexer',
        description: 'Analyzes uploaded documents and stores extracted knowledge in the vector knowledge base',
        category: 'files',
        icon: 'BookOpen',
        trigger: { type: 'FILE_UPLOADED' },
        actions: [
          { type: 'AI_EXTRACT', params: { entities: ['summary', 'key_points'] } },
          { type: 'KNOWLEDGE_CREATE_ITEM', params: { title: 'Indexed Document Summary' } },
        ],
      },
    ];
  }

  public async getLogs(query: { search?: string; status?: string; page?: number; limit?: number; workspaceId?: string }) {
    return this.getAllActivity(query);
  }
}
