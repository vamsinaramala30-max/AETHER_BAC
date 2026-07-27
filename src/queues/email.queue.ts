import { Queue, Job } from 'bullmq';
import { QueueFactory } from './queue';
import { logger } from '../config';

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

export const EMAIL_QUEUE_NAME = 'email-dispatch';

export const emailQueue: Queue<EmailJobData> =
  QueueFactory.createQueue<EmailJobData>(EMAIL_QUEUE_NAME);

export const emailWorker = QueueFactory.createWorker<EmailJobData, boolean>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>): Promise<boolean> => {
    logger.info(`Processing Email Job ${job.id} to recipient ${job.data.to}`);

    // Email transmission adapter simulation
    await new Promise((resolve) => setTimeout(resolve, 100));

    return true;
  },
);
