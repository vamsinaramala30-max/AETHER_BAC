import { db } from '../../../../database/client';
import { NotebookEntity } from './notebooks.entity';
import { CreateNotebookDto, UpdateNotebookDto } from './notebooks.dto';

/**
 * ASSUMPTION: this repository targets a `db.notebook` Prisma model added in
 * ../migrations/001_notebooks_sections.prisma. That file documents the exact
 * schema this repository expects. Field names here must stay in sync with it.
 */
function toEntity(notebook: any): NotebookEntity {
  return {
    id: notebook.id,
    userId: notebook.userId,
    name: notebook.name,
    description: notebook.description,
    color: notebook.color,
    order: notebook.order,
    isDefault: notebook.isDefault,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
  };
}

export class NotebooksRepository {
  async create(userId: string, dto: CreateNotebookDto): Promise<NotebookEntity> {
    const count = await db.notebook.count({ where: { userId, deletedAt: null } });
    const created = await db.notebook.create({
      data: {
        userId,
        name: dto.name?.trim() || 'Untitled Notebook',
        description: dto.description ?? null,
        color: dto.color ?? 'indigo',
        order: count,
        isDefault: false,
      },
    });
    return toEntity(created);
  }

  // Every read is scoped to userId at the query level — never fetch-then-filter.
  async findAllForUser(userId: string): Promise<NotebookEntity[]> {
    const notebooks = await db.notebook.findMany({
      where: { userId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
    return notebooks.map(toEntity);
  }

  async findById(id: string, userId: string): Promise<NotebookEntity | null> {
    const notebook = await db.notebook.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!notebook) return null;
    return toEntity(notebook);
  }

  async update(id: string, userId: string, dto: UpdateNotebookDto): Promise<NotebookEntity | null> {
    const owned = await this.findById(id, userId);
    if (!owned) return null;
    const updated = await db.notebook.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    return toEntity(updated);
  }

  async reorder(userId: string, orderedIds: string[]): Promise<void> {
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.notebook.updateMany({
          where: { id, userId },
          data: { order: index },
        }),
      ),
    );
  }

  /** Soft-delete (archive to Trash). Cascades to sections and pages. */
  async softDelete(id: string, userId: string): Promise<boolean> {
    const owned = await this.findById(id, userId);
    if (!owned) return false;
    const now = new Date();
    await db.$transaction([
      db.notebook.update({ where: { id }, data: { deletedAt: now } }),
      db.section.updateMany({ where: { notebookId: id, userId }, data: { deletedAt: now } }),
      db.note.updateMany({ where: { notebookId: id, userId }, data: { deletedAt: now } }),
    ]);
    return true;
  }

  async getOrCreateDefault(userId: string): Promise<NotebookEntity> {
    const existing = await db.notebook.findFirst({
      where: { userId, isDefault: true, deletedAt: null },
    });
    if (existing) return toEntity(existing);
    const created = await db.notebook.create({
      data: {
        userId,
        name: 'My Notebook',
        description: 'Automatically created to hold your existing notes.',
        color: 'indigo',
        order: 0,
        isDefault: true,
      },
    });
    return toEntity(created);
  }
}
