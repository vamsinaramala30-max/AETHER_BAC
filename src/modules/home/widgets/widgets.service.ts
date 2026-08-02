import { WidgetsRepository } from './widgets.repository';
import { WidgetsEntity } from './widgets.entity';

export class WidgetsService {
  constructor(private readonly repository: WidgetsRepository) {}

  async getDefaultWidgets(_userId: string): Promise<WidgetsEntity> {
    return {
      widgets: [
        { id: 'w1', widgetKey: 'daily_overview', title: 'Daily Overview', enabled: true, order: 1 },
        {
          id: 'w2',
          widgetKey: 'todays_schedule',
          title: "Today's Schedule",
          enabled: true,
          order: 2,
        },
        { id: 'w3', widgetKey: 'quick_actions', title: 'Quick Actions', enabled: true, order: 3 },
        {
          id: 'w4',
          widgetKey: 'recent_activity',
          title: 'Recent Activity',
          enabled: true,
          order: 4,
        },
      ],
    };
  }
}
