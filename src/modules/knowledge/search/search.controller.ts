import { SearchService } from './search.service';
import { GlobalSearchDto } from './search.dto';

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  async executeSearch(req: { body: GlobalSearchDto; user: { id: string } }) {
    return this.searchService.search(req.body, req.user.id);
  }

  async getSuggestions(req: { query: { q: string } }) {
    return this.searchService.getSuggestions(req.query.q);
  }
}