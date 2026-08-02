import { ProductivityRepository } from './productivity.repository';
import { GetProductivityStatsDto, AIProductivityInsightDto } from './productivity.dto';

export class ProductivityService {
  constructor(private readonly repository: ProductivityRepository) {}

  async calculateScore(
    completedTasks: number,
    focusTimeMinutes: number,
    goalProgress: number,
  ): Promise<number> {
    const taskFactor = Math.min(completedTasks * 10, 40);
    const focusFactor = Math.min((focusTimeMinutes / 120) * 40, 40);
    const goalFactor = Math.min(goalProgress * 0.2, 20);
    return Math.round(taskFactor + focusFactor + goalFactor);
  }

  async getStats(dto: GetProductivityStatsDto) {
    const snapshots = await this.repository.getSnapshots(dto);
    const totalFocus = snapshots.reduce((acc, curr) => acc + curr.totalFocusTimeSeconds, 0);
    const totalTasks = snapshots.reduce((acc, curr) => acc + curr.completedTasksCount, 0);

    return {
      period: dto.period,
      totalFocusHours: (totalFocus / 3600).toFixed(2),
      totalTasksCompleted: totalTasks,
      averageScore: snapshots.length
        ? Math.round(snapshots.reduce((acc, c) => acc + c.productivityScore, 0) / snapshots.length)
        : 0,
      snapshots,
    };
  }

  async getAIInsights(workspaceId: string, userId: string): Promise<AIProductivityInsightDto> {
    return {
      score: 85,
      recommendations: [
        'Schedule high-priority deep focus blocks in the morning.',
        'Take a 5-minute break every 25 minutes to sustain momentum.',
      ],
      trends: {
        focusTrend: 'UP',
        taskCompletionRate: 92.5,
      },
    };
  }
}
