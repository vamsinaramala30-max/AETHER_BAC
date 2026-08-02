import { AiRepository } from '../ai.repository';
import { PromptEntity } from './prompt-library.entity';

export class PromptLibraryRepository extends AiRepository {
  private collectionName = 'prompts';

  public async create(
    data: Omit<PromptEntity, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
  ): Promise<PromptEntity> {
    const collection = this.getCollection<PromptEntity>(this.collectionName);
    const id = `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const prompt: PromptEntity = {
      ...data,
      id,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    collection.set(id, prompt);
    return prompt;
  }

  public async findById(id: string): Promise<PromptEntity | null> {
    return this.getCollection<PromptEntity>(this.collectionName).get(id) || null;
  }
}
