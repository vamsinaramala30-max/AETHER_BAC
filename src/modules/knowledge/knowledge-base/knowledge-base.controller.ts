import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateCollectionDto, CreateArticleDto } from './knowledge-base.dto';

export class KnowledgeBaseController {
  constructor(private readonly kbService: KnowledgeBaseService) {}

  async createCollection(req: { body: CreateCollectionDto; user: { id: string } }) {
    return this.kbService.createCollection(req.body, req.user.id);
  }

  async createArticle(req: { body: CreateArticleDto; user: { id: string } }) {
    return this.kbService.createArticle(req.body, req.user.id);
  }

  async listArticles(req: { params: { collectionId: string } }) {
    return this.kbService.getCollectionArticles(req.params.collectionId);
  }
}