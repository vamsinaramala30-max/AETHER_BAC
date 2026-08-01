import { FavoriteType } from '../workspace.constants';

export class AddFavoriteDto {
  workspaceId: string;
  targetId: string;
  type: FavoriteType;
  title: string;
}

export class ReorderFavoritesDto {
  workspaceId: string;
  orderedIds: string[];
}

export class QueryFavoritesDto {
  workspaceId: string;
  type?: FavoriteType;
  search?: string;
}