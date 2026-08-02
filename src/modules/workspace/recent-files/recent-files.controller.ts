import { RecentFilesService } from './recent-files.service';
import { TrackFileAccessDto, QueryRecentFilesDto } from './recent-files.dto';

export class RecentFilesController {
  constructor(private readonly service: RecentFilesService) {}

  async track(userId: string, dto: TrackFileAccessDto) {
    return this.service.trackFile(userId, dto);
  }

  async findMany(userId: string, query: QueryRecentFilesDto) {
    return this.service.getRecentFiles(userId, query);
  }
}
