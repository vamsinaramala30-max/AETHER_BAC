export class WorkspaceRepository {
  async aggregateOverview(workspaceId: string, userId: string) {
    return {
      workspaceId,
      userId,
      generatedAt: new Date(),
    };
  }

  async executeTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
