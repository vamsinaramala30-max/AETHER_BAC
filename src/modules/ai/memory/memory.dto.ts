import { MemoryType } from './memory.entity';

export interface CreateMemoryDto {
  userId: string;
  workspaceId?: string;
  type: MemoryType;
  key: string;
  value: string;
  score?: number;
}

export interface QueryMemoryDto {
  userId: string;
  type?: MemoryType;
  query?: string;
}