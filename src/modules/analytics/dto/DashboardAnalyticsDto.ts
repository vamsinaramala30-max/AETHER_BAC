import { AnalyticsSummaryResponse } from './AnalyticsSummaryDto';
import {
  ProductivityTrendPoint,
  GoalAnalyticsDetail,
  TimeDistributionItem,
  AIRecommendationItem,
} from '../analytics.types';

export interface DashboardAnalyticsResponse {
  summary: AnalyticsSummaryResponse;
  productivityTrend: ProductivityTrendPoint[];
  topGoals: GoalAnalyticsDetail[];
  timeDistribution: TimeDistributionItem[];
  recommendations: AIRecommendationItem[];
}
