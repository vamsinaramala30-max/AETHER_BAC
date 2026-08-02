import { z } from 'zod';

export interface AnalyticsSummaryResponse {
  productivityScore: number;
  productivityScoreChange: number;
  totalTrackedHours: number;
  trackedHoursChange: number;
  activeGoalsCount: number;
  goalCompletionRate: number;
  aiInsightsGenerated: number;
  burnoutRiskIndex: number;
}
