import { SearchRepository } from './search.repository';
import { GlobalSearchDto } from './search.dto';
import { SearchResultItem } from './search.entity';
import { SearchType } from '../knowledge.constants';

export class SearchService {
  constructor(private readonly searchRepository: SearchRepository) {}

  async search(dto: GlobalSearchDto, userId: string): Promise<{ results: SearchResultItem[]; aiAnswer?: string }> {
    await this.searchRepository.recordSearch(userId, dto.query, dto.searchType || SearchType.HYBRID);

    const mockResults: SearchResultItem[] = [
      {
        id: 'res_1',
        type: 'NOTE',
        title: `Match for: ${dto.query}`,
        snippet: `Contains context matching the query '${dto.query}'...`,
        score: 0.92,
      },
    ];

    return {
      results: mockResults,
      aiAnswer: `AI generated answer synthesizing results for: "${dto.query}".`,
    };
  }

  async getSuggestions(query: string): Promise<string[]> {
    if (!query) return [];
    return [`${query} in backend`, `${query} guidelines`, `${query} architecture`].slice(0, 5);
  }
}