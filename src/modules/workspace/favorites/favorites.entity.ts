import { FavoriteType } from '../workspace.constants';

export class FavoriteEntity {
  declare id: string;
  declare workspaceId: string;
  declare userId: string;
  declare targetId: string;
  declare type: FavoriteType;
  declare title: string;
  declare order: number;
  declare createdAt: Date;

  constructor(partial: Partial<FavoriteEntity>) {
    Object.assign(this, partial);
  }
}
