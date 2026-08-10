import { Queue, Job } from 'bullmq';
import { QueueFactory } from './queue';
import { documentWorker } from '../modules/ai/workers/document-worker';
import { logger } from '../config';

export interface EmbeddingJobData {
  documentId: string;
  content: string;
}

export const EMBEDDING_QUEUE_NAME = 'embedding-generation';

export const embeddingQueue: Queue<EmbeddingJobData> =
  QueueFactory.createQueue<EmbeddingJobData>(EMBEDDING_QUEUE_NAME);

export const embeddingWorker = QueueFactory.createWorker<EmbeddingJobData, void>(
  EMBEDDING_QUEUE_NAME,
  async (job: Job<EmbeddingJobData>): Promise<void> => {
    logger.info(`Generating vector embeddings for Document ID: ${job.data.documentId}`);

    await documentWorker.processDocument({
      taskId: job.id || `task_${job.data.documentId}`,
      source: {
        type: 'text',
        content: job.data.content,
        metadata: { title: job.data.documentId, sourceUrl: '' },
      },
    });
  },
);

