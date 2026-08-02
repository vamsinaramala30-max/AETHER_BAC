import { ProductivityService } from './productivity.service';
import { GetProductivityStatsDto } from './productivity.dto';

export class ProductivityController {
  constructor(private readonly productivityService: ProductivityService) {}

  async getDashboard(query: GetProductivityStatsDto) {
    return this.productivityService.getStats(query);
  }

  async getAIInsights(workspaceId: string, userId: string) {
    return this.productivityService.getAIInsights(workspaceId, userId);
  }
}
