import { SearchHistoryEntity } from './search.entity';

export class SearchRepository {
  private history: SearchHistoryEntity[] = [];

  async recordSearch(userId: string, query: string, searchType: any): Promise<void> {
    this.history.push({
      id: `sh_${Date.now()}`,
      userId,
      query,
      searchType,
      createdAt: new Date(),
    });
  }

  async getRecentSearches(userId: string, limit = 5): Promise<SearchHistoryEntity[]> {
    return this.history
      .filter((h) => h.userId === userId)
      .slice(-limit)
      .reverse();
  }
}