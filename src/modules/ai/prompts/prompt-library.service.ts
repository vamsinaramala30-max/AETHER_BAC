import { PromptLibraryRepository } from './prompt-library.repository';
import { CreatePromptDto, UpdatePromptDto } from './prompt-library.dto';
import { PromptEntity } from './prompt-library.entity';

export class PromptLibraryService {
  constructor(private repository: PromptLibraryRepository) {}

  public async createPrompt(dto: CreatePromptDto): Promise<PromptEntity> {
    const vars = dto.variables || this.extractVariables(dto.content);
    return this.repository.create({
      title: dto.title,
      category: dto.category,
      content: dto.content,
      variables: vars,
      isPublic: dto.isPublic ?? false,
      authorId: dto.authorId,
    });
  }

  public async compilePrompt(promptId: string, values: Record<string, string>): Promise<string> {
    const prompt = await this.repository.findById(promptId);
    if (!prompt) throw new Error('Prompt template not found');

    let compiled = prompt.content;
    for (const [key, val] of Object.entries(values)) {
      compiled = compiled.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), val);
    }
    return compiled;
  }

  private extractVariables(content: string): string[] {
    const matches = content.match(/{{\s*[\w_]+\s*}}/g) || [];
    return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, '').trim())));
  }
}
