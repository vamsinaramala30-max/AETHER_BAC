/**
 * AETHER AI — History Manager
 * Prunes and token-optimizes user-scoped conversation history.
 */

import type { ConversationMessage } from './conversation-types.js';

export interface IHistoryManager {
  pruneHistory(
    messages: readonly ConversationMessage[],
    maxMessages?: number,
  ): readonly ConversationMessage[];
}

export class HistoryManager implements IHistoryManager {
  public pruneHistory(
    messages: readonly ConversationMessage[],
    maxMessages = 20,
  ): readonly ConversationMessage[] {
    if (messages.length <= maxMessages) {
      return [...messages];
    }

    // Always preserve system messages at the top if present
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const recentNonSystem = nonSystemMessages.slice(-maxMessages);

    return [...systemMessages, ...recentNonSystem];
  }
}

export const historyManager = new HistoryManager();
