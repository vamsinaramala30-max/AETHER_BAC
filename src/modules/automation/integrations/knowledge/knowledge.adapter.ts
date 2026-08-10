import { PrismaClient } from '@prisma/client';
import { KnowledgeService } from '../../../knowledge/knowledge.service';
import { KnowledgeRepository } from '../../../knowledge/knowledge.repository';
import { logger } from '../../../../config';

export class KnowledgeAdapter {
  private knowledgeService: KnowledgeService;

  constructor(private prisma: PrismaClient) {
    const repo = new KnowledgeRepository();
    this.knowledgeService = new KnowledgeService(repo);
  }

  public async createKnowledgeItem(params: {
    workspaceId: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    logger.info(`[KnowledgeAdapter] Creating knowledge item '${params.title}'`);
    return this.knowledgeService.notesService.createNote(
      {
        title: params.title,
        content: params.content,
      },
      'system',
    );
  }

  public async saveAIResult(params: {
    workspaceId: string;
    title: string;
    aiResponse: string;
    prompt?: string;
  }) {
    logger.info(`[KnowledgeAdapter] Saving AI result '${params.title}' to knowledge base`);
    return this.createKnowledgeItem({
      workspaceId: params.workspaceId,
      title: `[AI Result] ${params.title}`,
      content: params.aiResponse,
      metadata: {
        source: 'AETHER Automation Engine',
        prompt: params.prompt,
        savedAt: new Date().toISOString(),
      },
    });
  }

  public async tagKnowledge(knowledgeId: string, tags: string[]) {
    logger.info(`[KnowledgeAdapter] Tagging knowledge '${knowledgeId}' with tags: ${tags.join(', ')}`);
    return this.prisma.knowledgeBase.update({
      where: { id: knowledgeId },
      data: {
        metadata: {
          tags,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }
}
