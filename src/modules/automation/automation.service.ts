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
}
