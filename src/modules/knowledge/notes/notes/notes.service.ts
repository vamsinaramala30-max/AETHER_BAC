import { NotesRepository } from './notes.repository';
import { CreateNoteDto, UpdateNoteDto, QueryNotesDto, AiProcessNoteDto, MoveNoteDto, ReorderNotesDto } from './notes.dto';
import { NoteEntity, NoteVersion } from './notes.entity';
import { NotebooksRepository } from '../notebooks/notebooks.repository';
import { SectionsRepository } from '../sections/sections.repository';
import { NotesAiClient, notesAiClient, NotesAiResult } from '../ai/notes-ai.client';

export class NotesService {
  constructor(
    private readonly notesRepository: NotesRepository,
    private readonly notebooksRepository: NotebooksRepository,
    private readonly sectionsRepository: SectionsRepository,
    private readonly aiClient: NotesAiClient = notesAiClient,
  ) {}

  private async assertSectionOwned(sectionId: string, notebookId: string | undefined, userId: string) {
    const section = await this.sectionsRepository.findById(sectionId, userId);
    if (!section) throw new Error(`Section ${sectionId} not found or access denied.`);
    if (notebookId && section.notebookId !== notebookId) {
      throw new Error('Section does not belong to the given notebook.');
    }
    return section;
  }

  async createNote(dto: CreateNoteDto, userId: string): Promise<NoteEntity> {
    const isQuickNote = dto.isQuickNote || (!dto.notebookId && !dto.sectionId);

    let notebookId: string | null = null;
    let sectionId: string | null = null;

    if (!isQuickNote) {
      if (!dto.sectionId) throw new Error('sectionId is required for a filed page.');
      const section = await this.assertSectionOwned(dto.sectionId, dto.notebookId, userId);
      notebookId = section.notebookId;
      sectionId = section.id;
    }

    return this.notesRepository.create(userId, {
      title: dto.title || 'Untitled Page',
      content: dto.content || '',
      category: dto.category || 'General',
      tags: dto.tags || [],
      isPinned: dto.isPinned || false,
      isFavorite: false,
      isArchived: false,
      isQuickNote,
      notebookId,
      sectionId,
      order: 0,
      sharedWithUserIds: [],
      attachmentIds: [],
    });
  }

  async getNote(id: string, userId: string): Promise<NoteEntity> {
    const note = await this.notesRepository.findById(id, userId);
    if (!note) throw new Error(`Page with ID ${id} not found.`);
    return note;
  }

  async updateNote(id: string, dto: UpdateNoteDto, userId: string): Promise<NoteEntity> {
    await this.getNote(id, userId); // ownership check
    const updated = await this.notesRepository.update(id, userId, dto);
    if (!updated) throw new Error('Failed to update page.');
    return updated;
  }

  async moveNote(id: string, dto: MoveNoteDto, userId: string): Promise<NoteEntity> {
    await this.getNote(id, userId);
    await this.assertSectionOwned(dto.sectionId, dto.notebookId, userId);
    const moved = await this.notesRepository.move(id, userId, dto.notebookId, dto.sectionId);
    if (!moved) throw new Error('Failed to move page.');
    return moved;
  }

  async reorderNotes(dto: ReorderNotesDto, userId: string): Promise<void> {
    await this.assertSectionOwned(dto.sectionId, undefined, userId);
    await this.notesRepository.reorder(userId, dto.sectionId, dto.orderedIds);
  }

  async deleteNote(id: string, userId: string): Promise<boolean> {
    await this.getNote(id, userId);
    const deleted = await this.notesRepository.delete(id, userId);
    if (!deleted) throw new Error(`Failed to delete page with ID ${id}`);
    return true;
  }

  async listNotes(query: QueryNotesDto, userId: string) {
    return this.notesRepository.findAll(userId, query);
  }

  async getNoteHistory(id: string, userId: string): Promise<NoteVersion[]> {
    await this.getNote(id, userId);
    return this.notesRepository.getHistory(id, userId);
  }

  /**
   * Runs an AI action against the page's real, current content. For
   * read-only actions (SUMMARIZE, EXPLAIN, GENERATE_OUTLINE, EXTRACT_TASKS,
   * FIND_KEY_IDEAS, ASK) this only returns a preview and does NOT touch the
   * page. For content-modifying actions (IMPROVE_WRITING, CONTINUE_WRITING)
   * it also returns a preview — the caller must call applyAiSuggestion
   * explicitly to persist it. Nothing here is fabricated: if the AI client
   * isn't configured, this throws rather than returning templated text.
   */
  async processAiAction(id: string, dto: AiProcessNoteDto, userId: string): Promise<NotesAiResult> {
    const note = await this.getNote(id, userId);
    if (dto.action === 'ASK' && !dto.question?.trim()) {
      throw new Error('question is required for the ASK action.');
    }
    const result = await this.aiClient.run({
      action: dto.action,
      pageTitle: note.title,
      pageContent: note.content,
      question: dto.question,
    });

    if (dto.action === 'SUMMARIZE') {
      await this.notesRepository.update(id, userId, { aiSummary: result.output });
    }
    return result;
  }

  /** Persists a previously-returned AI suggestedContent after the user clicks Apply. */
  async applyAiSuggestion(id: string, content: string, userId: string): Promise<NoteEntity> {
    await this.getNote(id, userId);
    const updated = await this.notesRepository.update(id, userId, { content });
    if (!updated) throw new Error('Failed to apply AI suggestion.');
    return updated;
  }
}
