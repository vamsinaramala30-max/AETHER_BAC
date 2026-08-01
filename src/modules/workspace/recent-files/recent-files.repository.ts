import { RecentFileEntity } from './recent-files.entity';
import { QueryRecentFilesDto, TrackFileAccessDto } from './recent-files.dto';

export class RecentFilesRepository {
  private files: Map<string, RecentFileEntity> = new Map();

  async trackAccess(userId: string, dto: TrackFileAccessDto): Promise<RecentFileEntity> {
    const key = `${userId}_${dto.fileId}`;
    const existing = this.files.get(key);

    if (existing) {
      existing.accessCount += 1;
      existing.lastOpenedAt = new Date();
      existing.activityType = dto.activityType;
      this.files.set(key, existing);
      return existing;
    }

    const newRecord = new RecentFileEntity({
      id: `rf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      workspaceId: dto.workspaceId,
      fileId: dto.fileId,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      activityType: dto.activityType,
      accessCount: 1,
      lastOpenedAt: new Date(),
      createdAt: new Date(),
    });

    this.files.set(key, newRecord);
    return newRecord;
  }

  async findMany(userId: string, query: QueryRecentFilesDto): Promise<{ data: RecentFileEntity[]; total: number }> {
    let list = Array.from(this.files.values()).filter(
      (f) => f.userId === userId && f.workspaceId === query.workspaceId,
    );

    if (query.search) {
      const search = query.search.toLowerCase();
      list = list.filter((f) => f.fileName.toLowerCase().includes(search));
    }

    if (query.mimeType) {
      list = list.filter((f) => f.mimeType.startsWith(query.mimeType!));
    }

    list.sort((a, b) => b.lastOpenedAt.getTime() - a.lastOpenedAt.getTime());

    const total = list.length;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const data = list.slice((page - 1) * limit, page * limit);

    return { data, total };
  }
}