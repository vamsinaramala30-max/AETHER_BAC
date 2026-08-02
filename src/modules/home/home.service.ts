import { HomeRepository } from './home.repository';

export class HomeService {
  constructor(private readonly homeRepository: HomeRepository) {}

  async getHomeFeed(userId: string, workspaceId: string) {
    const data = await this.homeRepository.getAggregatedHomeData(userId, workspaceId);
    return {
      workspaceId,
      summary: data,
      timestamp: new Date().toISOString(),
    };
  }
}
