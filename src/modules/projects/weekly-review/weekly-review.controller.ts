// ============================================================================
// File: backend/src/modules/projects/weekly-review/weekly-review.controller.ts
// ============================================================================

import { WeeklyReviewService } from './weekly-review.service';
import { CreateWeeklyReviewDTO, WeeklyReviewFilterDTO } from './weekly-review.dto';

export class WeeklyReviewController {
  constructor(private readonly service: WeeklyReviewService) {}

  async submitReview(req: { body: CreateWeeklyReviewDTO }) {
    const data = await this.service.createOrUpdateReview(req.body);
    return { success: true, data };
  }

  async getOne(req: { params: { id: string } }) {
    const data = await this.service.getReview(req.params.id);
    return { success: true, data };
  }

  async list(req: { query: WeeklyReviewFilterDTO }) {
    const data = await this.service.getUserReviews(req.query);
    return { success: true, data };
  }

  async attachAiInsights(req: { params: { id: string }; body: { insights: string } }) {
    const data = await this.service.attachAiInsights(req.params.id, req.body.insights);
    return { success: true, data };
  }
}