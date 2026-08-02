import { FavoriteEntity } from './favorites.entity';
import { AddFavoriteDto, QueryFavoritesDto } from './favorites.dto';

export class FavoritesRepository {
  private favorites: Map<string, FavoriteEntity> = new Map();

  async add(userId: string, dto: AddFavoriteDto): Promise<FavoriteEntity> {
    const id = `fav_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const fav = new FavoriteEntity({
      id,
      userId,
      workspaceId: dto.workspaceId,
      targetId: dto.targetId,
      type: dto.type,
      title: dto.title,
      order: this.favorites.size + 1,
      createdAt: new Date(),
    });

    this.favorites.set(id, fav);
    return fav;
  }

  async remove(id: string): Promise<boolean> {
    return this.favorites.delete(id);
  }

  async findMany(userId: string, query: QueryFavoritesDto): Promise<FavoriteEntity[]> {
    let list = Array.from(this.favorites.values()).filter(
      (f) => f.userId === userId && f.workspaceId === query.workspaceId,
    );

    if (query.type) {
      list = list.filter((f) => f.type === query.type);
    }

    if (query.search) {
      const s = query.search.toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(s));
    }

    return list.sort((a, b) => a.order - b.order);
  }

  async updateOrder(orderedIds: string[]): Promise<void> {
    orderedIds.forEach((id, index) => {
      const item = this.favorites.get(id);
      if (item) {
        item.order = index + 1;
        this.favorites.set(id, item);
      }
    });
  }
}
