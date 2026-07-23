import { GoogleGenerativeAI } from '@google/generative-ai';
import { env, logger } from '../../../config';
import { AIProvider } from './provider.interface';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY || '');
  }

  public async generateText(
    prompt: string,
    options?: { systemInstruction?: string; temperature?: number }
  ): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({
        model: 'gemini-1.5-pro',
        systemInstruction: options?.systemInstruction,
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: options?.temperature ?? 0.7 },
      });

      return result.response.text() || '';
    } catch (err) {
      logger.error('Gemini Provider Error:', err);
      throw new Error('Gemini generation failed');
    }
  }

  public async generateEmbeddings(text: string): Promise<number[]> {
    try {
      const model = this.client.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (err) {
      logger.error('Gemini Embedding Error:', err);
      throw new Error('Embedding generation failed');
    }
  }
}