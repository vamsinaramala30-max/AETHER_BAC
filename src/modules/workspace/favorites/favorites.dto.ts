import { FavoriteType } from '../workspace.constants';

export class AddFavoriteDto {
  declare workspaceId: string;
  declare targetId: string;
  declare type: FavoriteType;
  declare title: string;
}

export class ReorderFavoritesDto {
  declare workspaceId: string;
  declare orderedIds: string[];
}

export class QueryFavoritesDto {
  declare workspaceId: string;
  type?: FavoriteType;
  search?: string;
}
