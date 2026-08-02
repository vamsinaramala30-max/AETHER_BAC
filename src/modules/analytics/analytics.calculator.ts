import { RawAggregateMetrics, CalculatedScores, TimeDistributionItem } from './analytics.types';

export class AnalyticsCalculator {
  public static calculateScores(metrics: RawAggregateMetrics): CalculatedScores {
    const taskRatio = metrics.totalTasks > 0 ? metrics.completedTasks / metrics.totalTasks : 0.5;
    const focusRatio =
      metrics.totalTrackedSeconds > 0 ? metrics.focusSeconds / metrics.totalTrackedSeconds : 0.5;

    const productivityScore = Math.min(100, Math.round(taskRatio * 50 + focusRatio * 50));
    const focusScore = Math.min(100, Math.round(focusRatio * 100));

    const totalMilestones = metrics.totalMilestones;
    const goalCompletionRate =
      totalMilestones > 0
        ? Number(((metrics.completedMilestones / totalMilestones) * 100).toFixed(1))
        : metrics.activeGoals + metrics.completedGoals > 0
          ? Number(
              (
                (metrics.completedGoals / (metrics.activeGoals + metrics.completedGoals)) *
                100
              ).toFixed(1),
            )
          : 0;

    const consistencyScore = Math.min(100, Math.round((metrics.sessionCount / 7) * 100));

    // High total work hours combined with low break ratio elevates burnout index
    const totalHours = metrics.totalTrackedSeconds / 3600;
    const breakRatio =
      metrics.totalTrackedSeconds > 0 ? metrics.breakSeconds / metrics.totalTrackedSeconds : 0;
    let burnoutRiskIndex = Math.min(100, Math.round(totalHours * 1.5 - breakRatio * 100));
    if (burnoutRiskIndex < 0) burnoutRiskIndex = 0;

    return {
      productivityScore,
      focusScore,
      goalCompletionRate,
      consistencyScore,
      burnoutRiskIndex,
    };
  }

  public static calculateTimeDistribution(metrics: RawAggregateMetrics): TimeDistributionItem[] {
    const total = metrics.totalTrackedSeconds || 1;

    const focusHours = Number((metrics.focusSeconds / 3600).toFixed(1));
    const meetingHours = Number((metrics.meetingSeconds / 3600).toFixed(1));
    const learningHours = Number((metrics.learningSeconds / 3600).toFixed(1));
    const breakHours = Number((metrics.breakSeconds / 3600).toFixed(1));
    const personalHours = Number((metrics.personalProjectSeconds / 3600).toFixed(1));

    return [
      {
        category: 'Focus Time',
        hours: focusHours,
        percentage: Number(((metrics.focusSeconds / total) * 100).toFixed(1)),
        fillColor: '#6366f1',
      },
      {
        category: 'Meetings',
        hours: meetingHours,
        percentage: Number(((metrics.meetingSeconds / total) * 100).toFixed(1)),
        fillColor: '#f59e0b',
      },
      {
        category: 'Learning',
        hours: learningHours,
        percentage: Number(((metrics.learningSeconds / total) * 100).toFixed(1)),
        fillColor: '#10b981',
      },
      {
        category: 'Break Time',
        hours: breakHours,
        percentage: Number(((metrics.breakSeconds / total) * 100).toFixed(1)),
        fillColor: '#64748b',
      },
      {
        category: 'Personal Projects',
        hours: personalHours,
        percentage: Number(((metrics.personalProjectSeconds / total) * 100).toFixed(1)),
        fillColor: '#ec4899',
      },
    ];
  }
}
