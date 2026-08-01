export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class AiRepository {
  private static store: Map<string, Map<string, any>> = new Map();

  protected getCollection<T>(collectionName: string): Map<string, T> {
    if (!AiRepository.store.has(collectionName)) {
      AiRepository.store.set(collectionName, new Map());
    }
    return AiRepository.store.get(collectionName)!;
  }

  public async paginate<T>(
    collectionName: string,
    filterFn: (item: T) => boolean = () => true,
    params: PaginationParams = {}
  ): Promise<PaginatedResult<T>> {
    const collection = this.getCollection<T>(collectionName);
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    let items = Array.from(collection.values()).filter(filterFn);

    if (params.sortBy) {
      const field = params.sortBy as keyof T;
      const order = params.sortOrder === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        if (a[field] < b[field]) return -1 * order;
        if (a[field] > b[field]) return 1 * order;
        return 0;
      });
    }

    const total = items.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const data = items.slice(startIndex, startIndex + limit);

    return { data, total, page, limit, totalPages };
  }

  public async getAnalyticsMetrics(workspaceId?: string): Promise<Record<string, number>> {
    const conversations = Array.from(this.getCollection<any>('conversations').values());
    const filtered = workspaceId ? conversations.filter((c) => c.workspaceId === workspaceId) : conversations;

    return {
      totalConversations: filtered.length,
      activeConversations: filtered.filter((c) => !c.isArchived).length,
      pinnedConversations: filtered.filter((c) => c.isPinned).length,
    };
  }
}