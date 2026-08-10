/**
 * AETHER AI — Provider-Independent Vector Database Abstraction
 * Supports: insert vectors, search vectors, update vectors, delete vectors.
 * Designed for local/self-hosted vector storage. No cloud dependencies.
 */

export interface VectorRecord {
  readonly id: string;
  readonly vector: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly documentId?: string;
  readonly collectionId?: string;
}

export interface VectorSearchResult {
  readonly id: string;
  readonly score: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly documentId?: string;
  readonly collectionId?: string;
}

export interface VectorQueryOptions {
  readonly topK: number;
  readonly filter?: Readonly<Record<string, unknown>>;
  readonly minScore?: number;
}

export interface VectorDatabaseProvider {
  insert(record: VectorRecord): Promise<void>;
  insertBatch(records: readonly VectorRecord[]): Promise<void>;
  search(queryVector: readonly number[], options: VectorQueryOptions): Promise<readonly VectorSearchResult[]>;
  update(record: VectorRecord): Promise<void>;
  delete(id: string): Promise<boolean>;
  deleteByFilter(filter: Readonly<Record<string, unknown>>): Promise<number>;
  clear(): Promise<void>;
}

export class InMemoryVectorDatabase implements VectorDatabaseProvider {
  private readonly records = new Map<string, VectorRecord>();

  public async insert(record: VectorRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  public async insertBatch(records: readonly VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  public async search(
    queryVector: readonly number[],
    options: VectorQueryOptions,
  ): Promise<readonly VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const record of this.records.values()) {
      if (options.filter && !this.matchesFilter(record.metadata, options.filter)) {
        continue;
      }

      const score = this.cosineSimilarity(queryVector, record.vector);
      if (options.minScore !== undefined && score < options.minScore) {
        continue;
      }

      results.push({
        id: record.id,
        score,
        metadata: record.metadata,
        documentId: record.documentId,
        collectionId: record.collectionId,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, options.topK);
  }

  public async update(record: VectorRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  public async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  public async deleteByFilter(filter: Readonly<Record<string, unknown>>): Promise<number> {
    let count = 0;
    for (const [id, record] of this.records.entries()) {
      if (this.matchesFilter(record.metadata, filter)) {
        this.records.delete(id);
        count++;
      }
    }
    return count;
  }

  public async clear(): Promise<void> {
    this.records.clear();
  }

  private cosineSimilarity(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i]!;
      const valB = b[i]!;
      dot += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private matchesFilter(
    metadata: Readonly<Record<string, unknown>>,
    filter: Readonly<Record<string, unknown>>,
  ): boolean {
    for (const [key, val] of Object.entries(filter)) {
      if (metadata[key] !== val) return false;
    }
    return true;
  }
}

export const globalVectorDatabase = new InMemoryVectorDatabase();
