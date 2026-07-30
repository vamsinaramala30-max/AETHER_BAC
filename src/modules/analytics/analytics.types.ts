export enum AnalyticsPreset {
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
  CUSTOM = 'custom',
}

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
}

export enum PriorityLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum RecommendationCategory {
  WEEKLY_PICKS = 'WeeklyPicks',
  FRESH_ANGLES = 'FreshAngles',
  OPTIMIZE = 'Optimize',
  DIRECTION = 'Direction',
}

export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
  preset?: AnalyticsPreset;
}

export interface RawAggregateMetrics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  totalTrackedSeconds: number;
  focusSeconds: number;
  breakSeconds: number;
  meetingSeconds: number;
  learningSeconds: number;
  personalProjectSeconds: number;
  activeGoals: number;
  completedGoals: number;
  totalMilestones: number;
  completedMilestones: number;
  aiPromptsCount: number;
  aiTokensUsed: number;
  workspaceEventsCount: number;
  sessionCount: number;
}

export interface CalculatedScores {
  productivityScore: number;
  focusScore: number;
  goalCompletionRate: number;
  consistencyScore: number;
  burnoutRiskIndex: number;
}

export interface TimeDistributionItem {
  category: string;
  hours: number;
  percentage: number;
  fillColor: string;
}

export interface ProductivityTrendPoint {
  date: string;
  score: number;
  completedTasks: number;
  pendingTasks: number;
  deepWorkHours: number;
}

export interface GoalAnalyticsDetail {
  id: string;
  title: string;
  category: string;
  progress: number;
  targetDate: string;
  milestonesCount: number;
  completedMilestonesCount: number;
}

export interface AIRecommendationItem {
  id: string;
  title: string;
  description: string;
  category: RecommendationCategory;
  priority: PriorityLevel;
  impactScore: number;
  actionableStep: string;
}

export interface ExportDataPayload {
  user: {
    id: string;
    email: string;
  };
  range: DateRangeFilter;
  generatedAt: string;
  metrics: RawAggregateMetrics;
  scores: CalculatedScores;
  recommendations: AIRecommendationItem[];
}