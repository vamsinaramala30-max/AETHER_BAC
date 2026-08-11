import { db } from '../../../database/client';
import { NoteEntity, NoteVersion } from './notes.entity';
import { QueryNotesDto } from './notes.dto';

const isValidUuid = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

async function getOrCreateUserId(userId?: string): Promise<string> {
  if (userId && isValidUuid(userId)) {
    const existing = await db.user.findUnique({ where: { id: userId } });
    if (existing) return existing.id;
  }
  let user = await db.user.findFirst();
  if (!user) {
    user = await db.user.create({
      data: {
        email: 'admin@aether.os',
        fullName: 'AETHER Admin',
        passwordHash: 'hash',
      },
    });
  }
  return user.id;
}

export class NotesRepository {
  async create(
    note: Omit<NoteEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  ): Promise<NoteEntity> {
    const ownerId = await getOrCreateUserId(note.ownerId);

    const created = await db.note.create({
      data: {
        title: note.title || 'Untitled Note',
        content: note.content || '',
        tags: note.tags || [],
        isPinned: note.isPinned || false,
        isFavorite: note.isFavorite || false,
        userId: ownerId,
        workspaceId: ownerId,
      },
    });

    return {
      id: created.id,
      title: created.title,
      content: created.content || '',
      tags: created.tags,
      category: note.category || 'General',
      isFavorite: created.isFavorite,
      isArchived: false,
      isPinned: created.isPinned,
      sharedWithUserIds: [],
      attachmentIds: note.attachmentIds || [],
      version: 1,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      ownerId: created.userId,
    };
  }

  async findById(id: string): Promise<NoteEntity | null> {
    if (!isValidUuid(id)) return null;
    const note = await db.note.findFirst({
      where: { id, deletedAt: null },
    });
    if (!note) return null;
    return {
      id: note.id,
      title: note.title,
      content: note.content || '',
      tags: note.tags,
      category: 'General',
      isFavorite: note.isFavorite,
      isArchived: false,
      isPinned: note.isPinned,
      sharedWithUserIds: [],
      attachmentIds: [],
      version: 1,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      ownerId: note.userId,
    };
  }

  async update(
    id: string,
    updates: Partial<NoteEntity>,
    userId: string,
  ): Promise<NoteEntity | null> {
    if (!isValidUuid(id)) return null;
    const dataToUpdate: any = {};
    if (updates.title !== undefined) dataToUpdate.title = updates.title;
    if (updates.content !== undefined) dataToUpdate.content = updates.content;
    if (updates.tags !== undefined) dataToUpdate.tags = updates.tags;
    if (updates.isPinned !== undefined) dataToUpdate.isPinned = updates.isPinned;
    if (updates.isFavorite !== undefined) dataToUpdate.isFavorite = updates.isFavorite;

    const updated = await db.note.update({
      where: { id },
      data: dataToUpdate,
    });

    return {
      id: updated.id,
      title: updated.title,
      content: updated.content || '',
      tags: updated.tags,
      category: updates.category || 'General',
      isFavorite: updated.isFavorite,
      isArchived: false,
      isPinned: updated.isPinned,
      sharedWithUserIds: [],
      attachmentIds: updates.attachmentIds || [],
      version: 2,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      ownerId: updated.userId,
    };
  }

  async delete(id: string): Promise<boolean> {
    if (!isValidUuid(id)) return true;
    try {
      await db.note.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async findAll(
    query: QueryNotesDto,
    userId: string,
  ): Promise<{ data: NoteEntity[]; total: number }> {
    const where: any = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.tags && query.tags.length > 0) {
      where.tags = { hasSome: query.tags };
    }
    if (query.isPinned !== undefined) where.isPinned = query.isPinned;
    if (query.isFavorite !== undefined) where.isFavorite = query.isFavorite;

    try {
      const page = Math.max(1, query.page || 1);
      const limit = Math.max(1, query.limit || 50);

      const [notes, total] = await Promise.all([
        db.note.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: limit,
          skip: (page - 1) * limit,
        }),
        db.note.count({ where }),
      ]);

      const data: NoteEntity[] = notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content || '',
        tags: note.tags,
        category: 'General',
        isFavorite: note.isFavorite,
        isArchived: false,
        isPinned: note.isPinned,
        sharedWithUserIds: [],
        attachmentIds: [],
        version: 1,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        ownerId: note.userId,
      }));

      return { data, total };
    } catch (err) {
      return { data: [], total: 0 };
    }
  }

  async getHistory(noteId: string): Promise<NoteVersion[]> {
    return [];
  }
}

