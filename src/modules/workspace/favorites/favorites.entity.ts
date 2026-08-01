import { FavoriteType } from '../workspace.constants';

export class FavoriteEntity {
  id: string;
  workspaceId: string;
  userId: string;
  targetId: string;
  type: FavoriteType;
  title: string;
  order: number;
  createdAt: Date;

  constructor(partial: Partial<FavoriteEntity>) {
    Object.assign(this, partial);
  }
}