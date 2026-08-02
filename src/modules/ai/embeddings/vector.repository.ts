import { AiRepository } from '../ai.repository';
import { EmbeddingEntity } from './embedding.entity';

export class VectorRepository extends AiRepository {
  private collectionName = 'vectors';

  public async insertVector(
    entity: Omit<EmbeddingEntity, 'id' | 'createdAt'>,
  ): Promise<EmbeddingEntity> {
    const collection = this.getCollection<EmbeddingEntity>(this.collectionName);
    const id = `vec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const item: EmbeddingEntity = { ...entity, id, createdAt: new Date() };
    collection.set(id, item);
    return item;
  }

  public async similaritySearch(
    targetVector: number[],
    topK = 5,
  ): Promise<Array<{ item: EmbeddingEntity; score: number }>> {
    const collection = this.getCollection<EmbeddingEntity>(this.collectionName);
    const results = Array.from(collection.values()).map((item) => ({
      item,
      score: this.cosineSimilarity(targetVector, item.vector),
    }));

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }
}
