export interface GenerateEmbeddingDto {
  input: string | string[];
  model?: string;
}

export interface VectorSearchDto {
  vector: number[];
  topK?: number;
  filter?: Record<string, any>;
}