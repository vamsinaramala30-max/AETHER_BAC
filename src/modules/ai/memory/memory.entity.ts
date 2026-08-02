export type MemoryType = 'short-term' | 'long-term' | 'semantic' | 'user-preference' | 'workspace';

export interface MemoryEntity {
  id: string;
  userId: string;
  workspaceId?: string;
  type: MemoryType;
  key: string;
  value: string;
  score: number;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}
