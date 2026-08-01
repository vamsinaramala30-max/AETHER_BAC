import { KnowledgeChunk } from './rag.entity';

export class RerankerService {
  public async rerank(query: string, chunks: KnowledgeChunk[]): Promise<KnowledgeChunk[]> {
    return chunks.sort((a, b) => b.score - a.score);
  }
}