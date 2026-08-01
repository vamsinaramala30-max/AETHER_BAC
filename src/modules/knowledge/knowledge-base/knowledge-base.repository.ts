import { KBCollectionEntity, KBArticleEntity } from './knowledge-base.entity';

export class KnowledgeBaseRepository {
  private collections = new Map<string, KBCollectionEntity>();
  private articles = new Map<string, KBArticleEntity>();

  async createCollection(col: Omit<KBCollectionEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<KBCollectionEntity> {
    const id = `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const entity: KBCollectionEntity = { ...col, id, createdAt: now, updatedAt: now };
    this.collections.set(id, entity);
    return entity;
  }

  async createArticle(art: Omit<KBArticleEntity, 'id' | 'viewCount' | 'createdAt' | 'updatedAt' | 'slug'>): Promise<KBArticleEntity> {
    const id = `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const slug = art.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const entity: KBArticleEntity = {
      ...art,
      id,
      slug,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.articles.set(id, entity);
    return entity;
  }

  async findCollectionById(id: string): Promise<KBCollectionEntity | null> {
    return this.collections.get(id) || null;
  }

  async listArticles(collectionId: string): Promise<KBArticleEntity[]> {
    return Array.from(this.articles.values()).filter((a) => a.collectionId === collectionId);
  }
}