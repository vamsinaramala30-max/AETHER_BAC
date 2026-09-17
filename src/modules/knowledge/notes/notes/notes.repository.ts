import { db } from '../../../../database/client';
import { NoteEntity, NoteVersion } from './notes.entity';
import { QueryNotesDto } from './notes.dto';

const isValidUuid = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

function toEntity(note: any): NoteEntity {
  return {
    id: note.id,
    title: note.title,
    content: note.content || '',
    formattedContent: note.formattedContent || undefined,
    tags: note.tags || [],
    category: note.category || 'General',
    notebookId: note.notebookId ?? null,
    sectionId: note.sectionId ?? null,
    order: note.order ?? 0,
    isFavorite: note.isFavorite,
    isArchived: note.isArchived ?? false,
    isPinned: note.isPinned,
    isQuickNote: note.isQuickNote ?? false,
    sharedWithUserIds: note.sharedWithUserIds || [],
    attachmentIds: note.attachmentIds || [],
    version: note.version ?? 1,
    aiSummary: note.aiSummary || undefined,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    ownerId: note.userId,
  };
}

export class NotesRepository {
  /**
   * FIX: previously this silently fell back to db.user.findFirst() or a
   * fabricated admin account when userId was missing/invalid, which could
   * attach a note to the wrong user. The controller already guarantees
   * req.user.id comes from an authenticated session, so we trust it as-is
   * and let a genuinely missing user surface as a real 404/auth error
   * instead of silently reassigning data.
   */
  private assertUsableUserId(userId: string): void {
    if (!userId || !isValidUuid(userId)) {
      throw new Error('A valid authenticated userId is required.');
    }
  }

  async create(
    userId: string,
    note: Omit<NoteEntity, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'ownerId'>,
  ): Promise<NoteEntity> {
    this.assertUsableUserId(userId);

    const count = note.sectionId
      ? await db.note.count({ where: { sectionId: note.sectionId, userId, deletedAt: null } })
      : 0;

    const created = await db.note.create({
      data: {
        title: note.title || 'Untitled Page',
        content: note.content || '',
        formattedContent: note.formattedContent || null,
        tags: note.tags || [],
        category: note.category || 'General',
        notebookId: note.notebookId,
        sectionId: note.sectionId,
        order: note.order ?? count,
        isPinned: note.isPinned || false,
        isFavorite: note.isFavorite || false,
        isArchived: note.isArchived || false,
        isQuickNote: note.isQuickNote || false,
        attachmentIds: note.attachmentIds || [],
        sharedWithUserIds: note.sharedWithUserIds || [],
        userId,
        workspaceId: userId,
      },
    });

    return toEntity(created);
  }

  // FIX: previously `where: { deletedAt: null }` had no userId clause at
  // all, so this leaked every user's notes to every caller. userId is now
  // mandatory and applied at the query level.
  async findById(id: string, userId: string): Promise<NoteEntity | null> {
    if (!isValidUuid(id)) return null;
    const note = await db.note.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!note) return null;
    return toEntity(note);
  }

  async update(id: string, userId: string, updates: Partial<NoteEntity>): Promise<NoteEntity | null> {
    if (!isValidUuid(id)) return null;
    const dataToUpdate: Record<string, unknown> = {};
    if (updates.title !== undefined) dataToUpdate.title = updates.title;
    if (updates.content !== undefined) dataToUpdate.content = updates.content;
    if (updates.formattedContent !== undefined) dataToUpdate.formattedContent = updates.formattedContent;
    if (updates.tags !== undefined) dataToUpdate.tags = updates.tags;
    if (updates.category !== undefined) dataToUpdate.category = updates.category;
    if (updates.isPinned !== undefined) dataToUpdate.isPinned = updates.isPinned;
    if (updates.isFavorite !== undefined) dataToUpdate.isFavorite = updates.isFavorite;
    if (updates.isArchived !== undefined) dataToUpdate.isArchived = updates.isArchived;
    if (updates.order !== undefined) dataToUpdate.order = updates.order;
    if (updates.attachmentIds !== undefined) dataToUpdate.attachmentIds = updates.attachmentIds;
    if (updates.sharedWithUserIds !== undefined) dataToUpdate.sharedWithUserIds = updates.sharedWithUserIds;
    if (updates.aiSummary !== undefined) dataToUpdate.aiSummary = updates.aiSummary;

    // Scoped update: matches on id AND userId so one user can never patch
    // another user's row even if they guess a valid page id.
    const result = await db.note.updateMany({
      where: { id, userId },
      data: dataToUpdate,
    });
    if (result.count === 0) return null;
    return this.findById(id, userId);
  }

  async move(id: string, userId: string, notebookId: string, sectionId: string): Promise<NoteEntity | null> {
    if (!isValidUuid(id)) return null;
    const count = await db.note.count({ where: { sectionId, userId, deletedAt: null } });
    const result = await db.note.updateMany({
      where: { id, userId },
      data: { notebookId, sectionId, isQuickNote: false, order: count },
    });
    if (result.count === 0) return null;
    return this.findById(id, userId);
  }

  async reorder(userId: string, sectionId: string, orderedIds: string[]): Promise<void> {
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.note.updateMany({
          where: { id, userId, sectionId },
          data: { order: index },
        }),
      ),
    );
  }

  async delete(id: string, userId: string): Promise<boolean> {
    if (!isValidUuid(id)) return true;
    try {
      await db.searchIndex.deleteMany({ where: { entityType: 'note', entityId: id } });
      await db.userFavorite.deleteMany({ where: { resourceType: 'note', resourceId: id } });
      const result = await db.note.updateMany({
        where: { id, userId },
        data: { deletedAt: new Date() },
      });
      return result.count > 0;
    } catch {
      return false;
    }
  }

  async findAll(
    userId: string,
    query: QueryNotesDto,
  ): Promise<{ data: NoteEntity[]; total: number }> {
    this.assertUsableUserId(userId);

    // userId is always present in `where` — this is the fix for the
    // previous cross-user leak in this method.
    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { content: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.tags && query.tags.length > 0) where.tags = { hasSome: query.tags };
    if (query.isPinned !== undefined) where.isPinned = query.isPinned;
    if (query.isFavorite !== undefined) where.isFavorite = query.isFavorite;
    if (query.isArchived !== undefined) where.isArchived = query.isArchived;
    if (query.notebookId !== undefined) where.notebookId = query.notebookId;
    if (query.sectionId !== undefined) where.sectionId = query.sectionId;
    if (query.isQuickNote !== undefined) where.isQuickNote = query.isQuickNote;

    try {
      const page = Math.max(1, query.page || 1);
      const limit = Math.max(1, Math.min(query.limit || 50, 200));
      const sortBy = query.sortBy || 'order';
      const sortOrder = query.sortOrder || 'asc';

      const [notes, total] = await Promise.all([
        db.note.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          take: limit,
          skip: (page - 1) * limit,
        }),
        db.note.count({ where }),
      ]);

      return { data: notes.map(toEntity), total };
    } catch {
      return { data: [], total: 0 };
    }
  }

  async getHistory(noteId: string, userId: string): Promise<NoteVersion[]> {
    // Scoped read; real version history persistence is a follow-up (see
    // Known Issues in the final report) — this intentionally returns []
    // rather than fabricating entries.
    const owned = await this.findById(noteId, userId);
    if (!owned) return [];
    return [];
  }
}
