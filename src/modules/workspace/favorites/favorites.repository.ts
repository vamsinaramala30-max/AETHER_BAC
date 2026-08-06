import { db } from '../../../database/client';
import { AddFavoriteDto, QueryFavoritesDto } from './favorites.dto';
import { FavoriteEntity } from './favorites.entity';

export class FavoritesRepository {
  private mapToEntity(f: any): FavoriteEntity {
    return new FavoriteEntity({
      id: f.id,
      userId: f.userId,
      workspaceId: f.workspaceId || '',
      targetId: f.resourceId,
      type: f.resourceType,
      title: f.title,
      order: f.order || 0,
      createdAt: f.createdAt,
    });
  }

  async add(userId: string, dto: AddFavoriteDto): Promise<FavoriteEntity> {
    const count = await db.userFavorite.count({ where: { userId } });

    const fav = await db.userFavorite.upsert({
      where: {
        userId_resourceType_resourceId: {
          userId,
          resourceType: dto.type,
          resourceId: dto.targetId,
        },
      },
      create: {
        userId,
        workspaceId: dto.workspaceId || null,
        resourceType: dto.type,
        resourceId: dto.targetId,
        title: dto.title,
        order: count,
      },
      update: {
        title: dto.title,
      },
    });

    return this.mapToEntity(fav);
  }

  async remove(id: string): Promise<boolean> {
    const result = await db.userFavorite.deleteMany({ where: { id } });
    return result.count > 0;
  }

  async findMany(userId: string, query: QueryFavoritesDto): Promise<FavoriteEntity[]> {
    const where: any = { userId };

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }
    if (query.type) {
      where.resourceType = query.type;
    }
    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const items = await db.userFavorite.findMany({
      where,
      orderBy: { order: 'asc' },
    });

    return items.map((f) => this.mapToEntity(f));
  }

  async updateOrder(orderedIds: string[]): Promise<void> {
    await Promise.all(
      orderedIds.map((id, index) =>
        db.userFavorite.updateMany({
          where: { id },
          data: { order: index },
        }),
      ),
    );
  }
}
