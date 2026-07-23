import { EmbeddingService } from '../embeddings/embedding.service';
import { db } from '../../../database/client';

export class RAGIngestion {
  private embeddings: EmbeddingService;

  constructor() {
    this.embeddings = new EmbeddingService();
  }

  public async ingestDocument(documentId: string, content: string): Promise<void> {
    const chunks = content.match(/[\s\S]{1,1000}/g) || [content];

    for (const chunk of chunks) {
      const vector = await this.embeddings.getEmbedding(chunk);
      const vectorString = `[${vector.join(',')}]`;
      await db.$executeRawUnsafe(
        `INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding") VALUES (gen_random_uuid(), $1, $2, $3::vector)`,
        documentId,
        chunk,
        vectorString
      );
    }
  }
}