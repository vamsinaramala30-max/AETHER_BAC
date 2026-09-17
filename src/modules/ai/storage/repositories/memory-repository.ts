/**
 * AETHER AI — Memory Repository
 * Authoritative persistence layer for memory items using Prisma (db.aIMemory) with in-memory caching.
 * User-scoped and strictly permission-isolated.
 */

import type { MemoryItem, UserId, MemoryId, MemoryType, MemoryScope, MemoryConfidence } from '../../ai-types.js';
import { db } from '../../../../database/client.js';
import crypto from 'node:crypto';

export function toUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  const hash = crypto.createHash('md5').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export interface IMemoryRepository {
  save(item: MemoryItem): Promise<void>;
  getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined>;
  getByUser(userId: UserId, types?: readonly MemoryType[]): Promise<readonly MemoryItem[]>;
  getByScope(
    userId: UserId,
    scope?: MemoryScope,
    workspaceId?: string,
    projectId?: string,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]>;
  update(id: MemoryId, userId: UserId, patch: Partial<MemoryItem>): Promise<MemoryItem | undefined>;
  delete(id: MemoryId, userId: UserId): Promise<boolean>;
  deleteByUser(userId: UserId): Promise<void>;
  findByContent(userId: UserId, contentQuery: string): Promise<readonly MemoryItem[]>;
  incrementAccessCount(id: MemoryId, userId: UserId): Promise<void>;
}

function recordToMemoryItem(record: any): MemoryItem {
  return {
    id: record.metadata?.originalId || record.id,
    userId: record.userId,
    workspaceId: record.workspaceId ?? undefined,
    projectId: record.projectId ?? undefined,
    type: record.category as MemoryType,
    scope: (record.scope as MemoryScope) ?? 'GLOBAL_USER',
    content: record.content,
    importance: record.importance,
    confidence: (record.confidence as MemoryConfidence) ?? 'user_provided',
    version: record.version ?? 1,
    accessCount: record.accessCount ?? 0,
    lastAccessedAt: record.lastAccessedAt?.getTime(),
    createdAt: record.createdAt instanceof Date ? record.createdAt.getTime() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.getTime() : record.updatedAt,
    expiresAt: record.expiresAt?.getTime(),
    metadata: {
      ...(record.metadata as any),
      status: record.status as any,
      source: record.source ?? undefined,
    },
  };
}

export class MemoryRepository implements IMemoryRepository {
  private readonly memoryCache = new Map<MemoryId, MemoryItem>();

  private get useDB(): boolean {
    return process.env.MEMORY_MODE !== 'in-memory' && Boolean((db as any).aIMemory);
  }

  /**
   * Save memory item authoritatively.
   * Write to DB first. If DB is configured/available, DB is authoritative.
   * If DB write fails in strict DB mode, throws error — does NOT silently store in RAM only.
   */
  public async save(item: MemoryItem): Promise<void> {
    const validUserId = toUuid(item.userId);
    const validId = toUuid(item.id);
    const status = (item.metadata?.status as string) || 'active';
    const metadata = {
      ...(item.metadata as any),
      originalId: item.id,
    };

    try {
      if (this.useDB) {
        await (db as any).aIMemory.upsert({
          where: { id: validId },
          update: {
            category: item.type,
            content: item.content,
            importance: item.importance,
            confidence: item.confidence ?? 'user_provided',
            source: (item.metadata?.source as string) ?? null,
            scope: item.scope ?? 'GLOBAL_USER',
            workspaceId: item.workspaceId ? toUuid(item.workspaceId) : null,
            projectId: item.projectId ? toUuid(item.projectId) : null,
            status,
            version: item.version ?? 1,
            metadata,
            updatedAt: new Date(item.updatedAt),
          },
          create: {
            id: validId,
            userId: validUserId,
            workspaceId: item.workspaceId ? toUuid(item.workspaceId) : null,
            projectId: item.projectId ? toUuid(item.projectId) : null,
            category: item.type,
            content: item.content,
            importance: item.importance,
            confidence: item.confidence ?? 'user_provided',
            source: (item.metadata?.source as string) ?? null,
            scope: item.scope ?? 'GLOBAL_USER',
            status,
            version: item.version ?? 1,
            metadata,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt),
          },
        });
      }
      this.memoryCache.set(item.id, item);
    } catch (error) {
      // In test mode or when DB table is not yet migrated in dev, fallback to memory cache.
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.MEMORY_MODE === 'in-memory' ||
        String(error).includes('does not exist')
      ) {
        this.memoryCache.set(item.id, item);
        return;
      }
      throw new Error(
        `Memory persistence failure for memory "${item.id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async getById(id: MemoryId, userId: UserId): Promise<MemoryItem | undefined> {
    const cached =
      this.memoryCache.get(id) ||
      Array.from(this.memoryCache.values()).find(
        (m) => m.id === id || toUuid(m.id) === toUuid(id),
      );
    if (cached && (cached.userId === userId || toUuid(cached.userId) === toUuid(userId))) {
      if (cached.metadata?.status === 'deleted' || cached.metadata?.status === 'superseded') {
        return undefined;
      }
      return cached;
    }

    try {
      const validUserId = toUuid(userId);
      const validId = toUuid(id);
      if (this.useDB) {
        const record = await (db as any).aIMemory.findFirst({
          where: { id: validId, userId: validUserId, status: { notIn: ['deleted', 'superseded'] } },
        });
        if (record) {
          const item = recordToMemoryItem(record);
          this.memoryCache.set(item.id, item);
          return item;
        }
      }
    } catch {
      // Fall through to cache
    }

    return cached &&
      cached.userId === userId &&
      cached.metadata?.status !== 'deleted' &&
      cached.metadata?.status !== 'superseded'
      ? cached
      : undefined;
  }

  public async getByUser(
    userId: UserId,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]> {
    const typeSet = types ? new Set(types) : undefined;
    const validUserId = toUuid(userId);

    try {
      if (this.useDB) {
        const records = await (db as any).aIMemory.findMany({
          where: {
            userId: validUserId,
            status: { notIn: ['deleted', 'superseded'] },
            ...(typeSet ? { category: { in: Array.from(typeSet) } } : {}),
          },
          orderBy: { updatedAt: 'desc' },
        });

        const items: MemoryItem[] = records.map(recordToMemoryItem);
        for (const [key, cached] of this.memoryCache) {
          if (cached.userId === userId) {
            this.memoryCache.delete(key);
          }
        }
        for (const item of items) {
          this.memoryCache.set(item.id, item);
          this.memoryCache.set(toUuid(item.id), item);
        }
        return items;
      }
    } catch {
      // Fallback to cache read
    }

    const results: MemoryItem[] = [];
    const seenIds = new Set<string>();
    for (const item of this.memoryCache.values()) {
      if (item.userId === userId || toUuid(item.userId) === validUserId) {
        if (item.metadata?.status === 'deleted' || item.metadata?.status === 'superseded') {
          continue;
        }
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        if (!typeSet || typeSet.has(item.type)) {
          results.push(item);
        }
      }
    }
    return results;
  }

  public async getByScope(
    userId: UserId,
    scope?: MemoryScope,
    workspaceId?: string,
    projectId?: string,
    types?: readonly MemoryType[],
  ): Promise<readonly MemoryItem[]> {
    const typeSet = types ? new Set(types) : undefined;
    const validUserId = toUuid(userId);

    try {
      if (this.useDB) {
        const where: any = {
          userId: validUserId,
          status: { notIn: ['deleted', 'superseded'] },
        };
        if (scope) where.scope = scope;
        if (workspaceId) where.workspaceId = toUuid(workspaceId);
        if (projectId) where.projectId = toUuid(projectId);
        if (typeSet) where.category = { in: Array.from(typeSet) };

        const records = await (db as any).aIMemory.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
        });

        return records.map(recordToMemoryItem);
      }
    } catch {
      // Fallback to cache
    }

    // Cache fallback with scope filtering
    const results: MemoryItem[] = [];
    const seenIds = new Set<string>();
    for (const item of this.memoryCache.values()) {
      if (item.userId !== userId && toUuid(item.userId) !== validUserId) continue;
      if (item.metadata?.status === 'deleted' || item.metadata?.status === 'superseded') continue;
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      if (scope && item.scope !== scope) continue;
      if (workspaceId && item.workspaceId !== workspaceId) continue;
      if (projectId && item.projectId !== projectId) continue;
      if (typeSet && !typeSet.has(item.type)) continue;
      results.push(item);
    }
    return results;
  }

  public async findByContent(userId: UserId, contentQuery: string): Promise<readonly MemoryItem[]> {
    const normalizedQuery = contentQuery.toLowerCase().trim();
    const validUserId = toUuid(userId);

    try {
      if (this.useDB) {
        const records = await (db as any).aIMemory.findMany({
          where: {
            userId: validUserId,
            status: { notIn: ['deleted', 'superseded'] },
          },
        });
        const items = records.map(recordToMemoryItem);
        const matched = items.filter((item: MemoryItem) => {
          const c = item.content.toLowerCase();
          if (c.includes(normalizedQuery)) return true;
          const tokens = normalizedQuery.split(/\s+/).filter((t) => t.length > 2);
          return tokens.length > 0 && tokens.every((t) => c.includes(t));
        });
        if (matched.length > 0) {
          return matched;
        }
      }
    } catch {
      // Fall through to cache
    }

    const results: MemoryItem[] = [];
    const seenIds = new Set<string>();
    for (const item of this.memoryCache.values()) {
      if (item.userId !== userId && toUuid(item.userId) !== validUserId) continue;
      if (item.metadata?.status === 'deleted' || item.metadata?.status === 'superseded') continue;
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      if (item.content.toLowerCase().includes(normalizedQuery)) {
        results.push(item);
      }
    }
    return results;
  }

  public async incrementAccessCount(id: MemoryId, userId: UserId): Promise<void> {
    const validId = toUuid(id);
    const validUserId = toUuid(userId);

    try {
      if (this.useDB) {
        await (db as any).aIMemory.updateMany({
          where: { id: validId, userId: validUserId },
          data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
        });
      }
    } catch {
      // Non-fatal
    }

    const cached = this.memoryCache.get(id);
    if (cached && cached.userId === userId) {
      const updated: MemoryItem = {
        ...cached,
        accessCount: cached.accessCount + 1,
        lastAccessedAt: Date.now(),
      };
      this.memoryCache.set(id, updated);
    }
  }

  public async update(
    id: MemoryId,
    userId: UserId,
    patch: Partial<MemoryItem>,
  ): Promise<MemoryItem | undefined> {
    const existing = await this.getById(id, userId);
    if (!existing) return undefined;

    const updated: MemoryItem = {
      ...existing,
      ...patch,
      version: (existing.version ?? 1) + 1,
      updatedAt: Date.now(),
    };

    await this.save(updated);
    return updated;
  }

  public async delete(id: MemoryId, userId: UserId): Promise<boolean> {
    const validUserId = toUuid(userId);
    const validId = toUuid(id);
    this.memoryCache.delete(id);
    this.memoryCache.delete(validId);
    for (const [key, item] of this.memoryCache) {
      if (item.id === id || toUuid(item.id) === validId) {
        this.memoryCache.delete(key);
      }
    }

    try {
      if (this.useDB) {
        await (db as any).aIMemory.updateMany({
          where: { id: validId, userId: validUserId },
          data: { status: 'deleted' },
        });
      }
      return true;
    } catch (error) {
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.MEMORY_MODE === 'in-memory' ||
        String(error).includes('does not exist')
      ) {
        return true;
      }
      throw new Error(
        `Memory deletion failure for memory "${id}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public async deleteByUser(userId: UserId): Promise<void> {
    for (const [id, item] of this.memoryCache) {
      if (item.userId === userId) {
        this.memoryCache.delete(id);
      }
    }
    const validUserId = toUuid(userId);
    try {
      if (this.useDB) {
        await (db as any).aIMemory.updateMany({
          where: { userId: validUserId },
          data: { status: 'deleted' },
        });
      }
    } catch (error) {
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.MEMORY_MODE === 'in-memory' ||
        String(error).includes('does not exist')
      ) {
        return;
      }
      throw new Error(
        `Memory deleteByUser failure for user "${userId}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const memoryRepository = new MemoryRepository();
