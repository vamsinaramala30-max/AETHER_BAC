import { PrismaClient } from '@prisma/client';
import { ExecutionEngine } from '../engine/execution-engine';
import { logger } from '../../../config';

export class AutomationWorker {
  private executionEngine: ExecutionEngine;

  constructor(prisma: PrismaClient) {
    this.executionEngine = new ExecutionEngine(prisma);
  }

  /**
   * Queue background task execution for non-blocking API processing.
   */
  public async queueExecution(
    automationId: string,
    triggerData?: Record<string, unknown>,
    userId?: string,
  ): Promise<void> {
    setImmediate(async () => {
      try {
        logger.info(`[AutomationWorker] Processing background execution for automation '${automationId}'`);
        await this.executionEngine.execute(automationId, triggerData, userId);
      } catch (err) {
        logger.error(`[AutomationWorker] Background execution error for '${automationId}':`, err);
      }
    });
  }
}
