export interface PromptEntity {
  id: string;
  title: string;
  category: string;
  content: string;
  variables: string[];
  isPublic: boolean;
  authorId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
