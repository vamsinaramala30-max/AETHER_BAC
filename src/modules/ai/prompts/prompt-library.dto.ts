export interface CreatePromptDto {
  title: string;
  category: string;
  content: string;
  variables?: string[];
  isPublic?: boolean;
  authorId: string;
}

export interface UpdatePromptDto {
  title?: string;
  content?: string;
  category?: string;
  isPublic?: boolean;
}
