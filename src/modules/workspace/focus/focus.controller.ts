import { FocusService } from './focus.service';
import { StartFocusSessionDto, FocusAnalyticsDto } from './focus.dto';

export class FocusController {
  constructor(private readonly focusService: FocusService) {}

  async start(userId: string, dto: StartFocusSessionDto) {
    return this.focusService.startSession(userId, dto);
  }

  async complete(sessionId: string, durationSeconds: number) {
    return this.focusService.completeSession(sessionId, durationSeconds);
  }

  async addDistraction(sessionId: string) {
    return this.focusService.recordDistraction(sessionId);
  }

  async getAnalytics(dto: FocusAnalyticsDto) {
    return this.focusService.getAnalytics(dto);
  }
}
