import { AIProvider } from './provider.interface';
import { logger } from '../../../config';

export class OpenAIProvider implements AIProvider {
  public async generateText(prompt: string): Promise<string> {
    logger.info(`OpenAI Provider processing prompt length: ${prompt.length}`);
    return `OpenAI Fallback Response: ${prompt}`;
  }

  public async generateEmbeddings(text: string): Promise<number[]> {
    logger.info(`OpenAI Embedding fallback length: ${text.length}`);
    return new Array(1536).fill(0);
  }
}
