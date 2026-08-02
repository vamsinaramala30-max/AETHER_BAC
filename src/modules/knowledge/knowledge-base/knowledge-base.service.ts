import { KnowledgeBaseRepository } from './knowledge-base.repository';
import { CreateCollectionDto, CreateArticleDto } from './knowledge-base.dto';

export class KnowledgeBaseService {
  constructor(private readonly kbRepo: KnowledgeBaseRepository) {}

  async createCollection(dto: CreateCollectionDto, userId: string) {
    return this.kbRepo.createCollection({
      name: dto.name,
      description: dto.description,
      workspaceId: dto.workspaceId,
      isPublic: dto.isPublic || false,
      ownerId: userId,
    });
  }

  async createArticle(dto: CreateArticleDto, userId: string) {
    const collection = await this.kbRepo.findCollectionById(dto.collectionId);
    if (!collection) throw new Error('Knowledge Base collection not found.');
    return this.kbRepo.createArticle({
      collectionId: dto.collectionId,
      title: dto.title,
      content: dto.content,
      categoryId: dto.categoryId,
      references: dto.references || [],
      authorId: userId,
    });
  }

  async getCollectionArticles(collectionId: string) {
    return this.kbRepo.listArticles(collectionId);
  }
}
