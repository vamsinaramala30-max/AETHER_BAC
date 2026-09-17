import { NotesService } from './notes.service';
import {
  CreateNoteDto,
  UpdateNoteDto,
  QueryNotesDto,
  AiProcessNoteDto,
  MoveNoteDto,
  ReorderNotesDto,
} from './notes.dto';

export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  async create(req: { body: CreateNoteDto; user: { id: string } }) {
    return this.notesService.createNote(req.body, req.user.id);
  }

  async findOne(req: { params: { id: string }; user: { id: string } }) {
    return this.notesService.getNote(req.params.id, req.user.id);
  }

  async update(req: { params: { id: string }; body: UpdateNoteDto; user: { id: string } }) {
    return this.notesService.updateNote(req.params.id, req.body, req.user.id);
  }

  async move(req: { params: { id: string }; body: MoveNoteDto; user: { id: string } }) {
    return this.notesService.moveNote(req.params.id, req.body, req.user.id);
  }

  async reorder(req: { body: ReorderNotesDto; user: { id: string } }) {
    await this.notesService.reorderNotes(req.body, req.user.id);
    return { success: true };
  }

  async remove(req: { params: { id: string }; user: { id: string } }) {
    return this.notesService.deleteNote(req.params.id, req.user.id);
  }

  async list(req: { query: QueryNotesDto; user: { id: string } }) {
    return this.notesService.listNotes(req.query, req.user.id);
  }

  async getHistory(req: { params: { id: string }; user: { id: string } }) {
    return this.notesService.getNoteHistory(req.params.id, req.user.id);
  }

  async aiProcess(req: { params: { id: string }; body: AiProcessNoteDto; user: { id: string } }) {
    return this.notesService.processAiAction(req.params.id, req.body, req.user.id);
  }

  async applyAiSuggestion(req: { params: { id: string }; body: { content: string }; user: { id: string } }) {
    return this.notesService.applyAiSuggestion(req.params.id, req.body.content, req.user.id);
  }
}
