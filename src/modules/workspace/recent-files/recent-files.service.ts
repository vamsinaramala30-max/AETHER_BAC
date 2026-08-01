import { RecentFilesRepository } from './recent-files.repository';
import { TrackFileAccessDto, QueryRecentFilesDto } from './recent-files.dto';

export class RecentFilesService {
  constructor(private readonly repository: RecentFilesRepository) {}

  async trackFile(userId: string, dto: TrackFileAccessDto) {
    return this.repository.trackAccess(userId, dto);
  }

  async getRecentFiles(userId: string, query: QueryRecentFilesDto) {
    return this.repository.findMany(userId, query);
  }
}