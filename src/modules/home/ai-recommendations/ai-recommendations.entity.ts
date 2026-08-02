export interface RecommendationEntity {
  id: string;
  title: string;
  description: string;
  actionUrl: string;
  type: 'SUGGESTION' | 'OPTIMIZATION' | 'REMINDER';
}

export interface AIRecommendationsEntity {
  recommendations: RecommendationEntity[];
}
