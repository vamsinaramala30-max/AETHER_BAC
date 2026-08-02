import { IndexJobEntity, DocumentChunk } from './indexing.entity';
import { IndexingState } from '../knowledge.constants';

export class IndexingRepository {
  private jobs = new Map<string, IndexJobEntity>();
  private chunks = new Map<string, DocumentChunk[]>();

  async createJob(documentId: string): Promise<IndexJobEntity> {
    const id = `idx_${Date.now()}`;
    const job: IndexJobEntity = {
      id,
      documentId,
      state: IndexingState.PENDING,
      chunksCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(id, job);
    return job;
  }

  async updateJobState(id: string, state: IndexingState, error?: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.state = state;
      job.errorMessage = error;
      job.updatedAt = new Date();
    }
  }

  async saveChunks(documentId: string, chunkList: DocumentChunk[]): Promise<void> {
    this.chunks.set(documentId, chunkList);
  }
}
