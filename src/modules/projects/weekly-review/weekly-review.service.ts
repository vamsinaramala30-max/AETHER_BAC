// ============================================================================
// File: backend/src/modules/projects/weekly-review/weekly-review.service.ts
// ============================================================================

import { WeeklyReviewRepository } from './weekly-review.repository';
import { WeeklyReviewEntity } from './weekly-review.entity';
import { CreateWeeklyReviewDTO, WeeklyReviewFilterDTO } from './weekly-review.dto';

export class WeeklyReviewService {
  constructor(private readonly repository: WeeklyReviewRepository) {}

  async createOrUpdateReview(dto: CreateWeeklyReviewDTO): Promise<WeeklyReviewEntity> {
    let review = await this.repository.findByUserAndWeek(dto.userId, dto.weekNumber, dto.year);
    const now = new Date();

    if (review) {
      review.productivityScore = dto.productivityScore;
      review.wins = dto.wins || review.wins;
      review.challenges = dto.challenges || review.challenges;
      review.improvementPlans = dto.improvementPlans || review.improvementPlans;
      review.reflectionNotes = dto.reflectionNotes;
    } else {
      review = {
        id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId: dto.userId,
        weekNumber: dto.weekNumber,
        year: dto.year,
        productivityScore: dto.productivityScore,
        completedTaskCount: 0,
        pendingTaskCount: 0,
        goalsAchievedCount: 0,
        wins: dto.wins || [],
        challenges: dto.challenges || [],
        improvementPlans: dto.improvementPlans || [],
        reflectionNotes: dto.reflectionNotes,
        aiInsights: null,
        createdAt: now,
        updatedAt: now,
      };
    }

    return this.repository.save(review);
  }

  async getReview(id: string): Promise<WeeklyReviewEntity> {
    const review = await this.repository.findById(id);
    if (!review) throw new Error(`Weekly review ${id} not found.`);
    return review;
  }

  async getUserReviews(filter: WeeklyReviewFilterDTO): Promise<WeeklyReviewEntity[]> {
    const reviews = await this.repository.findByUser(filter.userId);
    if (filter.year) {
      return reviews.filter((r) => r.year === filter.year);
    }
    return reviews;
  }

  async attachAiInsights(id: string, insights: string): Promise<WeeklyReviewEntity> {
    const review = await this.getReview(id);
    review.aiInsights = insights;
    return this.repository.save(review);
  }
}