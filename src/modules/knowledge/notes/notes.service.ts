import { NotesRepository } from './notes.repository';
import { CreateNoteDto, UpdateNoteDto, QueryNotesDto, AiProcessNoteDto } from './notes.dto';
import { NoteEntity, NoteVersion } from './notes.entity';

export class NotesService {
  constructor(private readonly notesRepository: NotesRepository) {}

  async createNote(dto: CreateNoteDto, userId: string): Promise<NoteEntity> {
    return this.notesRepository.create({
      title: dto.title,
      content: dto.content,
      category: dto.category || 'General',
      tags: dto.tags || [],
      isPinned: dto.isPinned || false,
      isFavorite: false,
      isArchived: false,
      sharedWithUserIds: [],
      attachmentIds: [],
      ownerId: userId,
    });
  }

  async getNote(id: string, userId: string): Promise<NoteEntity> {
    const note = await this.notesRepository.findById(id);
    if (!note) throw new Error(`Note with ID ${id} not found.`);
    if (note.ownerId !== userId && !note.sharedWithUserIds.includes(userId)) {
      throw new Error('Access denied to note.');
    }
    return note;
  }

  async updateNote(id: string, dto: UpdateNoteDto, userId: string): Promise<NoteEntity> {
    await this.getNote(id, userId); // Ensure authorization
    const updated = await this.notesRepository.update(id, dto, userId);
    if (!updated) throw new Error('Failed to update note.');
    return updated;
  }

  async deleteNote(id: string, userId: string): Promise<boolean> {
    await this.getNote(id, userId);
    return this.notesRepository.delete(id);
  }

  async listNotes(query: QueryNotesDto, userId: string) {
    return this.notesRepository.findAll(query, userId);
  }

  async getNoteHistory(id: string, userId: string): Promise<NoteVersion[]> {
    await this.getNote(id, userId);
    return this.notesRepository.getHistory(id);
  }

  async processAiAction(id: string, dto: AiProcessNoteDto, userId: string): Promise<NoteEntity> {
    const note = await this.getNote(id, userId);
    let summary = note.aiSummary;

    if (dto.action === 'SUMMARIZE') {
      summary = `[AI Summary (${dto.targetLength || 'MEDIUM'})]: Prepared summary of note titled "${note.title}".`;
    } else if (dto.action === 'REWRITE') {
      const rewrittenContent = `[AI Rewritten (${dto.tone || 'PROFESSIONAL'})]: ${note.content}`;
      return this.updateNote(id, { content: rewrittenContent }, userId);
    }

    const updated = await this.notesRepository.update(id, { aiSummary: summary }, userId);
    return updated!;
  }
}