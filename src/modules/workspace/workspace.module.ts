import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.repository';

import { CalendarController } from './calendar/calendar.controller';
import { CalendarService } from './calendar/calendar.service';
import { CalendarRepository } from './calendar/calendar.repository';

import { ProductivityController } from './productivity-hub/productivity.controller';
import { ProductivityService } from './productivity-hub/productivity.service';
import { ProductivityRepository } from './productivity-hub/productivity.repository';

import { FocusController } from './focus/focus.controller';
import { FocusService } from './focus/focus.service';
import { FocusRepository } from './focus/focus.repository';

import { RecentFilesController } from './recent-files/recent-files.controller';
import { RecentFilesService } from './recent-files/recent-files.service';
import { RecentFilesRepository } from './recent-files/recent-files.repository';

import { FavoritesController } from './favorites/favorites.controller';
import { FavoritesService } from './favorites/favorites.service';
import { FavoritesRepository } from './favorites/favorites.repository';

export class WorkspaceModule {
  public calendarRepository = new CalendarRepository();
  public productivityRepository = new ProductivityRepository();
  public focusRepository = new FocusRepository();
  public recentFilesRepository = new RecentFilesRepository();
  public favoritesRepository = new FavoritesRepository();
  public workspaceRepository = new WorkspaceRepository();

  public calendarService = new CalendarService(this.calendarRepository);
  public productivityService = new ProductivityService(this.productivityRepository);
  public focusService = new FocusService(this.focusRepository);
  public recentFilesService = new RecentFilesService(this.recentFilesRepository);
  public favoritesService = new FavoritesService(this.favoritesRepository);

  public workspaceService = new WorkspaceService(
    this.workspaceRepository,
    this.calendarService,
    this.productivityService,
    this.focusService,
    this.recentFilesService,
    this.favoritesService,
  );

  public calendarController = new CalendarController(this.calendarService);
  public productivityController = new ProductivityController(this.productivityService);
  public focusController = new FocusController(this.focusService);
  public recentFilesController = new RecentFilesController(this.recentFilesService);
  public favoritesController = new FavoritesController(this.favoritesService);
  public workspaceController = new WorkspaceController(this.workspaceService);
}
