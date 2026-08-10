/**
 * AETHER AI — Embedding Repository
 * Persistence layer for cached vectors and embedding metadata. Pure persistence only.
 */

export interface EmbeddingRecord {
  readonly id: string;
  readonly textHash: string;
  readonly vector: readonly number[];
  readonly modelId: string;
  readonly dimensions: number;
  readonly createdAt: number;
}

export interface IEmbeddingRepository {
  save(record: EmbeddingRecord): Promise<void>;
  getByHash(textHash: string, modelId: string): Promise<EmbeddingRecord | undefined>;
  deleteByHash(textHash: string, modelId: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class EmbeddingRepository implements IEmbeddingRepository {
  private readonly records = new Map<string, EmbeddingRecord>();

  public async save(record: EmbeddingRecord): Promise<void> {
    const key = `${record.modelId}:${record.textHash}`;
    this.records.set(key, record);
  }

  public async getByHash(textHash: string, modelId: string): Promise<EmbeddingRecord | undefined> {
    const key = `${modelId}:${textHash}`;
    return this.records.get(key);
  }

  public async deleteByHash(textHash: string, modelId: string): Promise<boolean> {
    const key = `${modelId}:${textHash}`;
    return this.records.delete(key);
  }

  public async clear(): Promise<void> {
    this.records.clear();
  }
}

export const embeddingRepository = new EmbeddingRepository();
