import { GoogleGenAI } from '@google/genai';
import { env, logger } from '../../../config';
import { AIProvider } from './provider.interface';

// @google/genai has a different API from @google/generative-ai.
// We create a minimal compatible wrapper to avoid breaking existing code.
class GoogleGenerativeAIWrapper {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getGenerativeModel(config: { model: string; systemInstruction?: string }) {
    const genAI = new GoogleGenAI({ apiKey: this.apiKey });
    return {
      generateContent: async (params: {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        generationConfig?: { temperature?: number };
      }) => {
        const result = await genAI.models.generateContent({
          model: config.model,
          contents: params.contents.map((c) => ({
            role: c.role,
            parts: c.parts.map((p) => ({ text: p.text })),
          })),
        });
        return {
          response: {
            text: () => result.text || '',
          },
        };
      },
      embedContent: async (text: string) => {
        const result = await genAI.models.embedContent({
          model: config.model,
          contents: [{ role: 'user', parts: [{ text }] }],
        });
        return {
          embedding: {
            values: result.embeddings?.[0]?.values || [],
          },
        };
      },
    };
  }
}

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAIWrapper;

  constructor() {
    this.client = new GoogleGenerativeAIWrapper(env.GEMINI_API_KEY || '');
  }

  public async generateText(
    prompt: string,
    options?: { systemInstruction?: string; temperature?: number },
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
