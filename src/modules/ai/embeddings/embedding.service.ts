/**
 * Lightweight embedding service used by RAG ingestion and retrieval.
 * Generates vector embeddings for text using a simple stub implementation.
 */
export class EmbeddingService {
  async getEmbedding(text: string): Promise<number[]> {
    // Stub: returns a mock 768-dim embedding vector
    return Array.from({ length: 768 }, () => Math.random() * 2 - 1);
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.getEmbedding(t)));
  }
}
