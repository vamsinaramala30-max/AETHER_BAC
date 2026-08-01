// ============================================================================
// File: backend/src/modules/projects/weekly-review/weekly-review.repository.ts
// ============================================================================

import { WeeklyReviewEntity } from './weekly-review.entity';

export class WeeklyReviewRepository {
  private reviews: Map<string, WeeklyReviewEntity> = new Map();

  async findById(id: string): Promise<WeeklyReviewEntity | null> {
    const review = this.reviews.get(id);
    return review ? { ...review } : null;
  }

  async findByUserAndWeek(userId: string, weekNumber: number, year: number): Promise<WeeklyReviewEntity | null> {
    const item = Array.from(this.reviews.values()).find(
      (r) => r.userId === userId && r.weekNumber === weekNumber && r.year === year
    );
    return item ? { ...item } : null;
  }

  async findByUser(userId: string): Promise<WeeklyReviewEntity[]> {
    return Array.from(this.reviews.values()).filter((r) => r.userId === userId);
  }

  async save(review: WeeklyReviewEntity): Promise<WeeklyReviewEntity> {
    this.reviews.set(review.id, { ...review, updatedAt: new Date() });
    return { ...this.reviews.get(review.id)! };
  }
}