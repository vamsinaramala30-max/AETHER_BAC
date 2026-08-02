export class ProductivitySnapshotEntity {
  declare id: string;
  declare workspaceId: string;
  declare userId: string;
  declare date: Date;
  declare productivityScore: number;
  declare completedTasksCount: number;
  declare totalFocusTimeSeconds: number;
  declare totalTrackedTimeSeconds: number;
  declare goalProgressPercentage: number;
  declare createdAt: Date;

  constructor(partial: Partial<ProductivitySnapshotEntity>) {
    Object.assign(this, partial);
  }
}
