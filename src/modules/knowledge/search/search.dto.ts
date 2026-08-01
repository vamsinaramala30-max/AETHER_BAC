import { SearchType } from '../knowledge.constants';

export class GlobalSearchDto {
  query!: string;
  searchType?: SearchType;
  limit?: number;
  filters?: {
    categories?: string[];
    tags?: string[];
    dateFrom?: string;
    dateTo?: string;
  };
}