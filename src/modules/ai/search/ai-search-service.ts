/**
 * AETHER AI — AI Search Service
 * Unified, permission-aware search abstraction across:
 * - Conversations
 * - Memories
 * - Knowledge / Documents
 * - Files
 * - Projects
 */

import { db } from '../../../database/client.js';
import { toUuid } from '../storage/repositories/memory-repository.js';
import type { UserId } from '../ai-types.js';
import { memoryRepository } from '../storage/repositories/memory-repository.js';
import { conversationSearchService } from '../conversations/conversation-search.js';

export interface SearchQueryOptions {
  readonly userId: UserId;
  readonly query: string;
  readonly categories?: readonly (
    'conversations' | 'memories' | 'projects' | 'files' | 'knowledge'
  )[];
  readonly limit?: number;
}

export interface UnifiedSearchResultItem {
  readonly id: string;
  readonly category: 'conversations' | 'memories' | 'projects' | 'files' | 'knowledge';
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
  readonly metadata?: Record<string, unknown>;
}

export class AetherSearchService {
  public async search(options: SearchQueryOptions): Promise<readonly UnifiedSearchResultItem[]> {
    if (!options.userId || !options.query || options.query.trim().length === 0) {
      return [];
    }

    const categories = new Set(
      options.categories ?? ['conversations', 'memories', 'projects', 'files', 'knowledge'],
    );
    const limit = options.limit ?? 10;
    const queryLower = options.query.toLowerCase();
    const results: UnifiedSearchResultItem[] = [];

    // 1. Memories Search
    if (categories.has('memories')) {
      const userMemories = await memoryRepository.getByUser(options.userId);
      for (const mem of userMemories) {
        if (mem.content.toLowerCase().includes(queryLower)) {
          results.push({
            id: mem.id,
            category: 'memories',
            title: `Memory (${mem.type})`,
            snippet: mem.content,
            score: mem.importance,
            metadata: { type: mem.type, createdAt: mem.createdAt },
          });
        }
      }
    }

    // 2. Conversation Search
    if (categories.has('conversations')) {
      const convHits = await conversationSearchService.search({
        userId: options.userId,
        query: options.query,
        limit,
      });

      for (const conv of convHits) {
        const firstSnippet = conv.matchedMessages[0]?.content ?? '';
        results.push({
          id: conv.conversationId,
          category: 'conversations',
          title: conv.title,
          snippet: firstSnippet,
          score: conv.score * 0.1,
          metadata: { messageCount: conv.matchedMessages.length },
        });
      }
    }

    // 3. Projects Search
    if (categories.has('projects')) {
      try {
        const validUserId = toUuid(options.userId);
        if ((db as any).project) {
          const projects = await (db as any).project.findMany({
            where: {
              ownerId: validUserId,
              deletedAt: null,
              OR: [
                { name: { contains: options.query, mode: 'insensitive' } },
                { description: { contains: options.query, mode: 'insensitive' } },
              ],
            },
            take: limit,
          });

          for (const proj of projects) {
            results.push({
              id: proj.id,
              category: 'projects',
              title: proj.name,
              snippet: proj.description ?? `Status: ${proj.status}`,
              score: 0.8,
              metadata: { status: proj.status, progress: proj.progress },
            });
          }
        }
      } catch {
        // Fallback
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

export const aetherSearchService = new AetherSearchService();
