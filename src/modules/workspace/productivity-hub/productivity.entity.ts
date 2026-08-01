export class ProductivitySnapshotEntity {
  id: string;
  workspaceId: string;
  userId: string;
  date: Date;
  productivityScore: number;
  completedTasksCount: number;
  totalFocusTimeSeconds: number;
  totalTrackedTimeSeconds: number;
  goalProgressPercentage: number;
  createdAt: Date;

  constructor(partial: Partial<ProductivitySnapshotEntity>) {
    Object.assign(this, partial);
  }
}