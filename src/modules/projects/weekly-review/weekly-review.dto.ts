// ============================================================================
// File: backend/src/modules/projects/weekly-review/weekly-review.dto.ts
// ============================================================================

export interface CreateWeeklyReviewDTO {
  userId: string;
  weekNumber: number;
  year: number;
  productivityScore: number;
  wins?: string[];
  challenges?: string[];
  improvementPlans?: string[];
  reflectionNotes: string;
}

export interface WeeklyReviewFilterDTO {
  userId: string;
  year?: number;
  page?: number;
  limit?: number;
}