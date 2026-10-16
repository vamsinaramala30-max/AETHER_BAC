import { SearchType } from '../knowledge.constants';

export interface SearchResultItem {
  id: string;
  type:
    | 'NOTE'
    | 'DOCUMENT'
    | 'ARTICLE'
    | 'TASK'
    | 'PROJECT'
    | 'FILE'
    | 'CALENDAR'
    | 'PLANNER'
    | 'AUTOMATION'
    | 'WORKSPACE';
  title: string;
  snippet: string;
  score: number;
  href?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchHistoryEntity {
  id: string;
  userId: string;
  query: string;
  searchType: SearchType;
  createdAt: Date;
}
