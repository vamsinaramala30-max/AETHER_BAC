import { db } from '../../../../database/client';
import { SectionEntity } from './sections.entity';
import { CreateSectionDto, UpdateSectionDto } from './sections.dto';

export class SectionsRepository {
  async create(userId: string, notebookId: string, dto: CreateSectionDto): Promise<SectionEntity> {
    const count = await db.section.count({ where: { notebookId, userId, deletedAt: null } });
    return db.section.create({
      data: {
        notebookId,
        userId,
        name: dto.name?.trim() || 'New Section',
        order: count,
      },
    });
  }

  async findAllForNotebook(notebookId: string, userId: string): Promise<SectionEntity[]> {
    return db.section.findMany({
      where: { notebookId, userId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  }

  async findById(id: string, userId: string): Promise<SectionEntity | null> {
    return db.section.findFirst({ where: { id, userId, deletedAt: null } });
  }

  async update(id: string, userId: string, dto: UpdateSectionDto): Promise<SectionEntity | null> {
    const owned = await this.findById(id, userId);
    if (!owned) return null;
    return db.section.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async move(id: string, userId: string, targetNotebookId: string): Promise<SectionEntity | null> {
    const owned = await this.findById(id, userId);
    if (!owned) return null;
    // Confirm the target notebook also belongs to this user before moving.
    const targetOwned = await db.notebook.findFirst({
      where: { id: targetNotebookId, userId, deletedAt: null },
    });
    if (!targetOwned) return null;
    return db.section.update({ where: { id }, data: { notebookId: targetNotebookId } });
  }

  async reorder(userId: string, notebookId: string, orderedIds: string[]): Promise<void> {
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.section.updateMany({
          where: { id, userId, notebookId },
          data: { order: index },
        }),
      ),
    );
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const owned = await this.findById(id, userId);
    if (!owned) return false;
    const now = new Date();
    await db.$transaction([
      db.section.update({ where: { id }, data: { deletedAt: now } }),
      db.note.updateMany({ where: { sectionId: id, userId }, data: { deletedAt: now } }),
    ]);
    return true;
  }
}
