import { Queue, QueueOptions, Worker, WorkerOptions, Processor } from 'bullmq';
import { redisConfig, logger } from '../config';

export class QueueFactory {
  private static defaultQueueOptions: QueueOptions = {
    connection: redisConfig.options,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600, // keep completed jobs for 24h
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // keep failed jobs for 7 days
      },
    },
  };

  /**
   * Instantiates a standardized BullMQ Queue instance.
   */
  public static createQueue<T = unknown>(name: string, customOptions?: Partial<QueueOptions>): Queue<T> {
    const queue = new Queue<T>(name, {
      ...QueueFactory.defaultQueueOptions,
      ...customOptions,
    });

    queue.on('error', (err) => {
      logger.error(`BullMQ Queue '${name}' Error:`, err);
    });

    return queue;
  }

  /**
   * Instantiates a standardized BullMQ Worker instance.
   */
  public static createWorker<T = unknown, R = unknown>(
    name: string,
    processor: Processor<T, R>,
    customOptions?: Partial<WorkerOptions>
  ): Worker<T, R> {
    const worker = new Worker<T, R>(name, processor, {
      connection: redisConfig.options,
      concurrency: 5,
      ...customOptions,
    });

    worker.on('completed', (job) => {
      logger.debug(`[Queue: ${name}] Job ${job.id} finished successfully.`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[Queue: ${name}] Job ${job?.id} failed with error: ${err.message}`, { stack: err.stack });
    });

    worker.on('error', (err) => {
      logger.error(`[Queue: ${name}] Worker process error:`, err);
    });

    return worker;
  }
}