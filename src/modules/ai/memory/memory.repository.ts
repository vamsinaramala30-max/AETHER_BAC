import { AiRepository } from '../ai.repository';
import { MemoryEntity } from './memory.entity';

export class MemoryRepository extends AiRepository {
  private collectionName = 'memories';

  public async create(data: Omit<MemoryEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<MemoryEntity> {
    const collection = this.getCollection<MemoryEntity>(this.collectionName);
    const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const memory: MemoryEntity = {
      ...data,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    collection.set(id, memory);
    return memory;
  }

  public async findByUser(userId: string): Promise<MemoryEntity[]> {
    const collection = this.getCollection<MemoryEntity>(this.collectionName);
    return Array.from(collection.values()).filter((m) => m.userId === userId);
  }

  public async delete(id: string): Promise<boolean> {
    return this.getCollection<MemoryEntity>(this.collectionName).delete(id);
  }
}