/**
 * AETHER AI — Memory Repository
 * Persistence layer for memory items. Pure persistence only — no business logic.
 */

import type { MemoryItem, UserId, MemoryId, MemoryType } from '../../ai-types.js';

export interface IMemoryRepository {
  save(item: MemoryItem): Promise<void>;
  getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined>;
  getByUser(userId: UserId, types?: readonly MemoryType[]): Promise<readonly MemoryItem[]>;
  delete(id: MemoryId, userId: UserId): Promise<boolean>;
  deleteByUser(userId: UserId): Promise<void>;
}

export class MemoryRepository implements IMemoryRepository {
  private readonly items = new Map<MemoryId, MemoryItem>();

  public async save(item: MemoryItem): Promise<void> {
    this.items.set(item.id, item);
  }

  public async getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined> {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) {
      return undefined;
    }
    return item;
  }

  public async getByUser(userId: UserId, types?: readonly MemoryType[]): Promise<readonly MemoryItem[]> {
    const results: MemoryItem[] = [];
    const typeSet = types ? new Set(types) : undefined;

    for (const item of this.items.values()) {
      if (item.userId === userId) {
        if (!typeSet || typeSet.has(item.type)) {
          results.push(item);
        }
      }
    }
    return results;
  }

  public async delete(id: MemoryId, userId: UserId): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.userId !== userId) {
      return false;
    }
    return this.items.delete(id);
  }

  public async deleteByUser(userId: UserId): Promise<void> {
    for (const [id, item] of this.items) {
      if (item.userId === userId) {
        this.items.delete(id);
      }
    }
  }
}

export const memoryRepository = new MemoryRepository();
