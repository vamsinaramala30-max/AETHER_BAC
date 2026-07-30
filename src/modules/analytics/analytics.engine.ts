import {
  RawAggregateMetrics,
  CalculatedScores,
  AIRecommendationItem,
  RecommendationCategory,
  PriorityLevel,
} from './analytics.types';

export class AnalyticsEngine {
  public static generateAIRecommendations(
    metrics: RawAggregateMetrics,
    scores: CalculatedScores
  ): AIRecommendationItem[] {
    const recommendations: AIRecommendationItem[] = [];

    if (scores.focusScore < 60) {
      recommendations.push({
        id: 'rec-focus-1',
        title: 'Batch Morning Meetings',
        description: 'Your focus score is below threshold. Consolidate meetings into afternoon hours to preserve peak morning clarity.',
        category: RecommendationCategory.WEEKLY_PICKS,
        priority: PriorityLevel.HIGH,
        impactScore: 92,
        actionableStep: 'Enable Focus Lock calendar automation.',
      });
    } else {
      recommendations.push({
        id: 'rec-focus-2',
        title: 'Maintain Deep Work Blocks',
        description: 'High focus detected. Protect current 2-hour uninterrupted calendar blocks.',
        category: RecommendationCategory.WEEKLY_PICKS,
        priority: PriorityLevel.LOW,
        impactScore: 75,
        actionableStep: 'Keep active settings intact.',
      });
    }

    if (scores.burnoutRiskIndex > 65) {
      recommendations.push({
        id: 'rec-burnout-1',
        title: 'Schedule Mandatory Micro-Breaks',
        description: 'High burnout risk detected relative to deep work intensity and low break ratio.',
        category: RecommendationCategory.OPTIMIZE,
        priority: PriorityLevel.HIGH,
        impactScore: 95,
        actionableStep: 'Inject 5-minute break intervals every 50 minutes.',
      });
    }

    if (metrics.learningSeconds < 7200) {
      recommendations.push({
        id: 'rec-skill-1',
        title: 'Skill Expansion Horizon',
        description: 'Learning allocation is under 2 hours for this period. Dedicate targeted time to core tech upgrades.',
        category: RecommendationCategory.FRESH_ANGLES,
        priority: PriorityLevel.MEDIUM,
        impactScore: 84,
        actionableStep: 'Bookmark 1 technical research module per week.',
      });
    }

    recommendations.push({
      id: 'rec-direction-1',
      title: 'Align Quarterly Milestones',
      description: 'Current task completion velocity aligns with top strategic goals.',
      category: RecommendationCategory.DIRECTION,
      priority: PriorityLevel.MEDIUM,
      impactScore: 88,
      actionableStep: 'Review milestone target dates in Goals view.',
    });

    return recommendations;
  }
}