import { IndexingRepository } from './indexing.repository';
import { TriggerIndexDto } from './indexing.dto';
import { IndexingState } from '../knowledge.constants';

export class IndexingService {
  constructor(private readonly indexingRepo: IndexingRepository) {}

  async triggerIndexing(dto: TriggerIndexDto) {
    const job = await this.indexingRepo.createJob(dto.documentId);
    
    // Asynchronous background processing simulation
    this.processIndexingPipeline(job.id, dto.documentId).catch(async (err) => {
      await this.indexingRepo.updateJobState(job.id, IndexingState.FAILED, err.message);
    });

    return job;
  }

  private async processIndexingPipeline(jobId: string, documentId: string) {
    await this.indexingRepo.updateJobState(jobId, IndexingState.EXTRACTING);
    // 1. Text extraction step...
    
    await this.indexingRepo.updateJobState(jobId, IndexingState.CHUNKED);
    // 2. Chunking logic (e.g. 500 tokens with overlap)
    await this.indexingRepo.saveChunks(documentId, [
      { id: `chk_1`, documentId, chunkIndex: 0, content: 'Extracted text segment...', tokenCount: 45 },
    ]);

    await this.indexingRepo.updateJobState(jobId, IndexingState.EMBEDDED);
    // 3. Vector embedding generation...

    await this.indexingRepo.updateJobState(jobId, IndexingState.INDEXED);
  }
}