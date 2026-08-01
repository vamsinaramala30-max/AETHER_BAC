import { NoteEntity, NoteVersion } from './notes.entity';
import { QueryNotesDto } from './notes.dto';

export class NotesRepository {
  private notesMap = new Map<string, NoteEntity>();
  private versionsMap = new Map<string, NoteVersion[]>();

  async create(note: Omit<NoteEntity, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<NoteEntity> {
    const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const newNote: NoteEntity = {
      ...note,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.notesMap.set(id, newNote);
    this.recordVersion(newNote, note.ownerId);
    return newNote;
  }

  async findById(id: string): Promise<NoteEntity | null> {
    return this.notesMap.get(id) || null;
  }

  async update(id: string, updates: Partial<NoteEntity>, userId: string): Promise<NoteEntity | null> {
    const existing = this.notesMap.get(id);
    if (!existing) return null;

    const updated: NoteEntity = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date(),
    };

    this.notesMap.set(id, updated);
    this.recordVersion(updated, userId);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    this.versionsMap.delete(id);
    return this.notesMap.delete(id);
  }

  async findAll(query: QueryNotesDto, userId: string): Promise<{ data: NoteEntity[]; total: number }> {
    let results = Array.from(this.notesMap.values()).filter(
      (n) => n.ownerId === userId || n.sharedWithUserIds.includes(userId)
    );

    if (query.category) results = results.filter((n) => n.category === query.category);
    if (query.isFavorite !== undefined) results = results.filter((n) => n.isFavorite === query.isFavorite);
    if (query.isArchived !== undefined) results = results.filter((n) => n.isArchived === query.isArchived);
    if (query.isPinned !== undefined) results = results.filter((n) => n.isPinned === query.isPinned);
    if (query.tags && query.tags.length > 0) {
      results = results.filter((n) => query.tags!.some((t) => n.tags.includes(t)));
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      results = results.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }

    const total = results.length;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const paginated = results.slice((page - 1) * limit, page * limit);

    return { data: paginated, total };
  }

  async getHistory(noteId: string): Promise<NoteVersion[]> {
    return this.versionsMap.get(noteId) || [];
  }

  private recordVersion(note: NoteEntity, userId: string): void {
    const history = this.versionsMap.get(note.id) || [];
    history.push({
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      noteId: note.id,
      title: note.title,
      content: note.content,
      versionNumber: note.version,
      createdAt: new Date(),
      createdBy: userId,
    });
    this.versionsMap.set(note.id, history);
  }
}