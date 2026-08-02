import { ContinueWorkingRepository } from './continue-working.repository';
import { ContinueWorkingEntity } from './continue-working.entity';

export class ContinueWorkingService {
  constructor(private readonly repository: ContinueWorkingRepository) {}

  async getRecentWork(
    userId: string,
    workspaceId: string,
    limit: number,
  ): Promise<ContinueWorkingEntity> {
    const items = await this.repository.getRecentItems(userId, workspaceId, limit);
    return { items };
  }
}
