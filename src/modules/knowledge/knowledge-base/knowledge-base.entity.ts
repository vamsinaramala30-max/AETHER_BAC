export interface KBCollectionEntity {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface KBArticleEntity {
  id: string;
  collectionId: string;
  categoryId?: string;
  title: string;
  slug: string;
  content: string;
  references: string[]; // Related article/document IDs
  viewCount: number;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}
