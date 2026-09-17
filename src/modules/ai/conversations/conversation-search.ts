/**
 * AETHER AI — Conversation Search Service
 * Searches past conversations and messages for user requests like:
 * "What did we discuss about the Aether backend last week?"
 * Fully user-scoped and permission-isolated.
 */

import { db } from '../../../database/client.js';
import { toUuid } from '../storage/repositories/memory-repository.js';
import type { ContextMessage, UserId } from '../ai-types.js';

export interface ConversationSearchOptions {
  readonly userId: UserId;
  readonly query: string;
  readonly timeRangeMs?: number;
  readonly limit?: number;
}

export interface ConversationSearchResult {
  readonly conversationId: string;
  readonly title: string;
  readonly matchedMessages: readonly ContextMessage[];
  readonly score: number;
}

export class ConversationSearchService {
  public async search(
    options: ConversationSearchOptions,
  ): Promise<readonly ConversationSearchResult[]> {
    if (!options.userId || !options.query || options.query.trim().length === 0) {
      return [];
    }

    if (process.env['MEMORY_MODE'] === 'in-memory') {
      return [];
    }

    const validUserId = toUuid(options.userId);
    const limit = options.limit ?? 5;
    const sinceDate = options.timeRangeMs ? new Date(Date.now() - options.timeRangeMs) : undefined;
    const terms = options.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    try {
      if ((db as any).conversation && (db as any).message) {

        const conversations = await (db as any).conversation.findMany({
          where: {
            userId: validUserId,
            deletedAt: null,
            ...(sinceDate ? { updatedAt: { gte: sinceDate } } : {}),
          },
          include: {
            messages: {
              where: {
                ...(sinceDate ? { createdAt: { gte: sinceDate } } : {}),
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        });

        const results: ConversationSearchResult[] = [];

        for (const conv of conversations) {
          const matchedMessages: ContextMessage[] = [];
          let matchScore = 0;

          for (const msg of conv.messages) {
            const contentLower = msg.content.toLowerCase();
            const hitCount = terms.filter((term) => contentLower.includes(term)).length;
            if (hitCount > 0) {
              matchScore += hitCount;
              matchedMessages.push({
                messageId: msg.id,
                role: msg.role === 'user' || msg.role === 'USER' ? 'user' : 'assistant',
                content: msg.content,
                timestamp: msg.createdAt.getTime(),
              });
            }
          }

          if (matchedMessages.length > 0) {
            results.push({
              conversationId: conv.id,
              title: conv.title,
              matchedMessages,
              score: matchScore,
            });
          }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
      }
    } catch {
      // Fallback
    }

    return [];
  }
}

export const conversationSearchService = new ConversationSearchService();
