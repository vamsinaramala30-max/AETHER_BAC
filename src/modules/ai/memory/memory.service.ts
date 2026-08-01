import { MemoryRepository } from './memory.repository';
import { CreateMemoryDto, QueryMemoryDto } from './memory.dto';
import { MemoryEntity } from './memory.entity';

export class MemoryService {
  constructor(private repository: MemoryRepository) {}

  public async storeMemory(dto: CreateMemoryDto): Promise<MemoryEntity> {
    return this.repository.create({
      userId: dto.userId,
      workspaceId: dto.workspaceId,
      type: dto.type,
      key: dto.key,
      value: dto.value,
      score: dto.score ?? 1.0,
    });
  }

  public async retrieveRelevantMemory(dto: QueryMemoryDto): Promise<MemoryEntity[]> {
    const memories = await this.repository.findByUser(dto.userId);
    return memories.filter((m) => {
      if (dto.type && m.type !== dto.type) return false;
      if (dto.query && !m.value.toLowerCase().includes(dto.query.toLowerCase())) return false;
      return true;
    });
  }

  public async cleanupOldMemories(userId: string): Promise<number> {
    const memories = await this.repository.findByUser(userId);
    let count = 0;
    for (const mem of memories) {
      if (mem.score < 0.2) {
        await this.repository.delete(mem.id);
        count++;
      }
    }
    return count;
  }
}