// ============================================================================
// File: backend/src/modules/projects/weekly-review/weekly-review.entity.ts
// ============================================================================

export interface WeeklyReviewEntity {
  id: string;
  userId: string;
  weekNumber: number;
  year: number;
  productivityScore: number; // 1-10 scale
  completedTaskCount: number;
  pendingTaskCount: number;
  goalsAchievedCount: number;
  wins: string[];
  challenges: string[];
  improvementPlans: string[];
  reflectionNotes: string;
  aiInsights: string | null;
  createdAt: Date;
  updatedAt: Date;
}