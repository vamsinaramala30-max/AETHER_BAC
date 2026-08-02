import { AutomationRepository } from './automation.repository';
import { AppError } from '../../middleware/error.middleware';
import { Prisma } from '@prisma/client';

export class AutomationService {
  private repo: AutomationRepository;

  constructor() {
    this.repo = new AutomationRepository();
  }

  public async createAutomation(
    workspaceId: string,
    name: string,
    trigger: string,
    actions: Prisma.InputJsonValue,
  ) {
    return this.repo.create(workspaceId, name, trigger, actions);
  }

  public async getAutomations(workspaceId: string) {
    return this.repo.findByWorkspaceId(workspaceId);
  }

  public async getAutomationById(id: string) {
    const auto = await this.repo.findById(id);
    if (!auto) {
      throw new AppError('Automation rule not found', 404, 'AUTOMATION_NOT_FOUND');
    }
    return auto;
  }

  public async updateAutomation(
    id: string,
    data: { name?: string; isEnabled?: boolean; actions?: Prisma.InputJsonValue },
  ) {
    await this.getAutomationById(id);
    return this.repo.update(id, data);
  }

  public async deleteAutomation(id: string) {
    await this.getAutomationById(id);
    return this.repo.delete(id);
  }

  public async getLogs(query: { search?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 20);

    const mockLogs = [
      {
        id: 'log_1',
        timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
        automationName: 'Daily Slack Sync & Digest',
        trigger: 'Scheduled (Cron)',
        status: 'SUCCESS',
        duration: '1.2s',
        executedBy: 'System Scheduler',
        errorMessage: null,
      },
      {
        id: 'log_2',
        timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
        automationName: 'Github Webhook PR Auto-Assign',
        trigger: 'Webhook Event',
        status: 'SUCCESS',
        duration: '450ms',
        executedBy: 'Vamsi Naramala',
        errorMessage: null,
      },
      {
        id: 'log_3',
        timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
        automationName: 'Google Drive Document Indexer',
        trigger: 'File Upload',
        status: 'FAILED',
        duration: '3.8s',
        executedBy: 'AI Knowledge Service',
        errorMessage: 'Connection timeout while parsing PDF binary stream',
      },
      {
        id: 'log_4',
        timestamp: new Date(Date.now() - 5 * 3600000).toISOString(),
        automationName: 'Workspace Member Role Sync',
        trigger: 'Manual Trigger',
        status: 'SUCCESS',
        duration: '820ms',
        executedBy: 'Admin User',
        errorMessage: null,
      },
    ];

    let filtered = mockLogs;

    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.automationName.toLowerCase().includes(q) ||
          l.trigger.toLowerCase().includes(q) ||
          l.executedBy.toLowerCase().includes(q),
      );
    }

    if (query.status && query.status !== 'ALL') {
      const targetStatus = query.status.toUpperCase();
      filtered = filtered.filter((l) => l.status === targetStatus);
    }

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      logs: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
