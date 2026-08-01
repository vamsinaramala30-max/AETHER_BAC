export interface EmbeddingEntity {
  id: string;
  vector: number[];
  documentId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}