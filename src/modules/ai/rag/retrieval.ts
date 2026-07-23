import { EmbeddingService } from '../embeddings/embedding.service';
import { VectorService } from '../vector/vector.service';

export class RAGRetrieval {
  private embeddings: EmbeddingService;
  private vector: VectorService;

  constructor() {
    this.embeddings = new EmbeddingService();
    this.vector = new VectorService();
  }

  public async retrieveContext(query: string): Promise<string> {
    try {
      const queryVector = await this.embeddings.getEmbedding(query);
      const matches = await this.vector.searchSimilarDocuments(queryVector, 3);
      return matches.map((m) => m.content).join('\n---\n');
    } catch {
      return '';
    }
  }
}