import { Queue, Job } from 'bullmq';
import { QueueFactory } from './queue';
import { ImageProcessor } from '../storage/ImageProcessor';
import { logger } from '../config';

export interface UploadJobData {
  fileKey: string;
  bufferBase64: string;
  mimeType: string;
  workspaceId: string;
}

export const UPLOAD_QUEUE_NAME = 'file-processing';

export const uploadQueue: Queue<UploadJobData> = QueueFactory.createQueue<UploadJobData>(UPLOAD_QUEUE_NAME);

export const uploadWorker = QueueFactory.createWorker<UploadJobData, void>(
  UPLOAD_QUEUE_NAME,
  async (job: Job<UploadJobData>): Promise<void> => {
    logger.info(`Processing uploaded file asset in background: ${job.data.fileKey}`);

    if (job.data.mimeType.startsWith('image/')) {
      const buffer = Buffer.from(job.data.bufferBase64, 'base64');
      await ImageProcessor.processBuffer(buffer, { quality: 75, format: 'webp' });
    }
  }
);