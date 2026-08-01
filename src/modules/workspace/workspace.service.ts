import { CalendarService } from './calendar/calendar.service';
import { ProductivityService } from './productivity-hub/productivity.service';
import { FocusService } from './focus/focus.service';
import { RecentFilesService } from './recent-files/recent-files.service';
import { FavoritesService } from './favorites/favorites.service';
import { WorkspaceRepository } from './workspace.repository';

export class WorkspaceService {
  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    public readonly calendar: CalendarService,
    public readonly productivity: ProductivityService,
    public readonly focus: FocusService,
    public readonly recentFiles: RecentFilesService,
    public readonly favorites: FavoritesService,
  ) {}

  async getOverview(workspaceId: string, userId: string) {
    const [events, recent, favs, focusAnalytics] = await Promise.all([
      this.calendar.getEvents({ workspaceId, limit: 5 }),
      this.recentFiles.getRecentFiles(userId, { workspaceId, limit: 5 }),
      this.favorites.getFavorites(userId, { workspaceId }),
      this.focus.getAnalytics({ workspaceId, userId }),
    ]);

    return {
      workspaceId,
      upcomingEvents: events.data,
      recentFiles: recent.data,
      favorites: favs,
      focusSummary: focusAnalytics,
    };
  }
}