import { db } from '../../../database/client';

export class VectorService {
  public async searchSimilarDocuments(embedding: number[], topK: number = 5) {
    const vectorString = `[${embedding.join(',')}]`;
    const results = await db.$queryRawUnsafe<Array<{ id: string; content: string; score: number }>>(
      `SELECT id, content, 1 - (embedding <=> $1::vector) as score FROM "DocumentChunk" ORDER BY embedding <=> $1::vector LIMIT $2`,
      vectorString,
      topK
    );
    return results;
  }
}