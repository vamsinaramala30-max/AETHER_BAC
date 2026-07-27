import { Queue, Job } from 'bullmq';
import { QueueFactory } from './queue';
import { RAGIngestion } from '../modules/ai/rag/ingestion';
import { logger } from '../config';

export interface EmbeddingJobData {
  documentId: string;
  content: string;
}

export const EMBEDDING_QUEUE_NAME = 'embedding-generation';

export const embeddingQueue: Queue<EmbeddingJobData> =
  QueueFactory.createQueue<EmbeddingJobData>(EMBEDDING_QUEUE_NAME);

const ragIngestion = new RAGIngestion();

export const embeddingWorker = QueueFactory.createWorker<EmbeddingJobData, void>(
  EMBEDDING_QUEUE_NAME,
  async (job: Job<EmbeddingJobData>): Promise<void> => {
    logger.info(`Generating vector embeddings for Document ID: ${job.data.documentId}`);

    await ragIngestion.ingestDocument(job.data.documentId, job.data.content);
  },
);
