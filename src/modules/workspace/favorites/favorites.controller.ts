import { FavoritesService } from './favorites.service';
import { AddFavoriteDto, QueryFavoritesDto, ReorderFavoritesDto } from './favorites.dto';

export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  async add(userId: string, dto: AddFavoriteDto) {
    return this.service.addFavorite(userId, dto);
  }

  async remove(id: string) {
    return this.service.removeFavorite(id);
  }

  async findMany(userId: string, query: QueryFavoritesDto) {
    return this.service.getFavorites(userId, query);
  }

  async reorder(dto: ReorderFavoritesDto) {
    return this.service.reorder(dto);
  }
}