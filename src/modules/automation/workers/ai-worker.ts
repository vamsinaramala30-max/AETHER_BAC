import { AIAdapter } from '../integrations/ai/ai.adapter';
import { logger } from '../../../config';

export class AIWorker {
  private aiAdapter: AIAdapter;

  constructor() {
    this.aiAdapter = new AIAdapter();
  }

  public async queueAITask(
    taskType: 'summarize' | 'analyze' | 'ask',
    payload: { prompt?: string; text?: string; focusArea?: string },
    callback?: (result: unknown) => void,
  ): Promise<void> {
    setImmediate(async () => {
      try {
        logger.info(`[AIWorker] Executing async AI task '${taskType}'`);
        let res: unknown;
        if (taskType === 'summarize') {
          res = await this.aiAdapter.summarizeText(payload.text || '');
        } else if (taskType === 'analyze') {
          res = await this.aiAdapter.analyze(payload.text || '', payload.focusArea);
        } else {
          res = await this.aiAdapter.askAether(payload.prompt || payload.text || '');
        }

        if (callback) callback(res);
      } catch (err) {
        logger.error(`[AIWorker] AI task execution error:`, err);
      }
    });
  }
}
