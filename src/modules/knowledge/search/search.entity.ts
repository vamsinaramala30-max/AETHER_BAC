import { SearchType } from '../knowledge.constants';

export interface SearchResultItem {
  id: string;
  type: 'NOTE' | 'DOCUMENT' | 'ARTICLE';
  title: string;
  snippet: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SearchHistoryEntity {
  id: string;
  userId: string;
  query: string;
  searchType: SearchType;
  createdAt: Date;
}