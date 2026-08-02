export class CreateCollectionDto {
  name!: string;
  description?: string;
  workspaceId!: string;
  isPublic?: boolean;
}

export class CreateArticleDto {
  collectionId!: string;
  title!: string;
  content!: string;
  categoryId?: string;
  references?: string[];
}
