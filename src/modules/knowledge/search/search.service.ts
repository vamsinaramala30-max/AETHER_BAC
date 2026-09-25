import { SearchRepository } from './search.repository';
import { GlobalSearchDto } from './search.dto';
import { SearchResultItem } from './search.entity';
import { SearchType } from '../knowledge.constants';
import { db } from '../../../database/client';
import { defaultRAGEngine } from '../../ai/rag/rag-engine';

export class SearchService {
  constructor(private readonly searchRepository: SearchRepository) {}

  async search(
    dto: GlobalSearchDto,
    userId: string,
  ): Promise<{ results: SearchResultItem[]; aiAnswer?: string }> {
    await this.searchRepository.recordSearch(
      userId,
      dto.query,
      dto.searchType || SearchType.HYBRID,
    );

    const q = dto.query.trim().toLowerCase();
    const results: SearchResultItem[] = [];

    // 1. Search real user notes with user boundary
    const notes = await db.note.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
    });

    for (const note of notes) {
      results.push({
        id: note.id,
        type: 'NOTE',
        title: note.title,
        snippet: (note.content || '').slice(0, 200),
        score: note.title.toLowerCase().includes(q) ? 0.95 : 0.8,
      });
    }

    // 2. Search documents via RAGEngine
    const ragResult = await defaultRAGEngine.query({
      text: dto.query,
      userId,
      topK: 5,
      scoreThreshold: 0.1,
    });

    if (ragResult.ok) {
      for (const doc of ragResult.value.documents) {
        results.push({
          id: doc.documentId,
          type: 'DOCUMENT',
          title: doc.citation?.title || (doc.metadata as any)?.title || 'Document',
          snippet: doc.citation?.excerpt || doc.content.slice(0, 200),
          score: doc.score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const aiAnswer =
      results.length > 0
        ? `Found ${results.length} relevant knowledge record(s) matching "${dto.query}".`
        : `No matching knowledge records found for "${dto.query}".`;

    return {
      results,
      aiAnswer,
    };
  }

  async getSuggestions(query: string): Promise<string[]> {
    if (!query) return [];
    return [`${query} in backend`, `${query} guidelines`, `${query} architecture`].slice(0, 5);
  }
}
