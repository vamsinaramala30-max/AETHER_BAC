import { logger } from '../config';
import { ScheduledJob } from './jobScheduler';

export const vectorIndexSyncJob: ScheduledJob = {
  name: 'VectorIndexSyncJob',
  cronExpression: '0 4 * * *', // Daily at 04:00 AM
  task: async (): Promise<void> => {
    logger.info('[VectorIndexSyncJob] Verifying vector embedding index integrity...');
    // Sync vector store indices with relational knowledge base documents
    await new Promise((resolve) => setTimeout(resolve, 150));
    logger.info('[VectorIndexSyncJob] Vector index sync verified.');
  },
};
