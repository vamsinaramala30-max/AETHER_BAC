export class GetProductivityStatsDto {
  declare workspaceId: string;
  declare userId: string;
  declare period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startDate?: Date;
  endDate?: Date;
}

export class AIProductivityInsightDto {
  declare score: number;
  declare recommendations: string[];
  declare trends: {
    focusTrend: 'UP' | 'DOWN' | 'STABLE';
    taskCompletionRate: number;
  };
}
