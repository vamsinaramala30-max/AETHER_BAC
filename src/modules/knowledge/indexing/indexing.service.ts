import { IndexingRepository } from './indexing.repository';
import { TriggerIndexDto } from './indexing.dto';
import { IndexingState } from '../knowledge.constants';
import { db } from '../../../database/client';
import { defaultRAGEngine } from '../../ai/rag/rag-engine';

export class IndexingService {
  constructor(private readonly indexingRepo: IndexingRepository) {}

  async triggerIndexing(dto: TriggerIndexDto) {
    const job = await this.indexingRepo.createJob(dto.documentId);

    // Run real indexing pipeline asynchronously
    this.processIndexingPipeline(job.id, dto.documentId).catch(async (err) => {
      await this.indexingRepo.updateJobState(job.id, IndexingState.FAILED, err.message);
    });

    return job;
  }

  private async processIndexingPipeline(jobId: string, documentId: string) {
    await this.indexingRepo.updateJobState(jobId, IndexingState.EXTRACTING);

    const doc = await db.document.findUnique({
      where: { id: documentId },
      include: { knowledgeBase: true },
    });

    if (!doc) {
      await this.indexingRepo.updateJobState(jobId, IndexingState.FAILED, `Document ${documentId} not found`);
      return;
    }

    let parsed: any = {};
    try {
      if (doc.content) parsed = JSON.parse(doc.content);
    } catch {}

    const textContent = parsed.description || parsed.title || doc.fileName || '';
    if (!textContent || textContent.trim().length === 0) {
      await this.indexingRepo.updateJobState(jobId, IndexingState.FAILED, 'Document has no text content to index');
      return;
    }

    await this.indexingRepo.updateJobState(jobId, IndexingState.CHUNKED);

    const ingestResult = await defaultRAGEngine.ingest({
      id: doc.id,
      type: 'text',
      content: textContent,
      filename: doc.fileName || 'Document',
      metadata: {
        title: doc.fileName || parsed.title || 'Document',
        userId: parsed.ownerId || '',
        workspaceId: parsed.workspaceId || doc.knowledgeBase?.workspaceId,
        category: parsed.category || 'General',
        source: doc.fileUrl || doc.fileName || '',
      },
    });

    if (!ingestResult.ok) {
      await this.indexingRepo.updateJobState(
        jobId,
        IndexingState.FAILED,
        ingestResult.error.message || String(ingestResult.error),
      );
      return;
    }

    await this.indexingRepo.updateJobState(jobId, IndexingState.EMBEDDED);
    await this.indexingRepo.updateJobState(jobId, IndexingState.INDEXED);
  }
}

