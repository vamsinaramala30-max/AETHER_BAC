import { FavoritesRepository } from './favorites.repository';
import { AddFavoriteDto, QueryFavoritesDto, ReorderFavoritesDto } from './favorites.dto';

export class FavoritesService {
  constructor(private readonly repository: FavoritesRepository) {}

  async addFavorite(userId: string, dto: AddFavoriteDto) {
    return this.repository.add(userId, dto);
  }

  async removeFavorite(id: string) {
    const success = await this.repository.remove(id);
    if (!success) throw new Error(`Favorite ${id} not found`);
  }

  async getFavorites(userId: string, query: QueryFavoritesDto) {
    return this.repository.findMany(userId, query);
  }

  async reorder(dto: ReorderFavoritesDto) {
    await this.repository.updateOrder(dto.orderedIds);
  }
}