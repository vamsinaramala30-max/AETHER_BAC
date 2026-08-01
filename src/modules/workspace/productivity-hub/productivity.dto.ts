export class GetProductivityStatsDto {
  workspaceId: string;
  userId: string;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startDate?: Date;
  endDate?: Date;
}

export class AIProductivityInsightDto {
  score: number;
  recommendations: string[];
  trends: {
    focusTrend: 'UP' | 'DOWN' | 'STABLE';
    taskCompletionRate: number;
  };
}