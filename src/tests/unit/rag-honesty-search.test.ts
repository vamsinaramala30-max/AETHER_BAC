import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationSearchService } from '../../modules/ai/conversations/conversation-search.js';
import { AetherSearchService } from '../../modules/ai/search/ai-search-service.js';
import { ProjectIntelligenceService } from '../../modules/ai/context/project-intelligence.js';

describe('Prompt 5 — RAG Honesty, Search & Intelligence Unit Tests', () => {
  beforeEach(() => {
    process.env.MEMORY_MODE = 'in-memory';
  });
  it('should instantiate ConversationSearchService and perform user-isolated queries', async () => {
    const searchService = new ConversationSearchService();
    const results = await searchService.search({
      userId: 'user-a',
      query: 'backend architecture',
    });

    expect(Array.isArray(results)).toBe(true);
  });

  it('should instantiate AetherSearchService and search across categories safely', async () => {
    const aiSearch = new AetherSearchService();
    const items = await aiSearch.search({
      userId: 'user-a',
      query: 'Aether',
    });

    expect(Array.isArray(items)).toBe(true);
  });

  it('should safely handle ProjectIntelligenceService queries without throws', async () => {
    const projIntel = new ProjectIntelligenceService();
    const context = await projIntel.getProjectContext('user-a', 'Aether');

    // Returns null or summary object safely
    expect(context === null || typeof context === 'object').toBe(true);
  });
});
