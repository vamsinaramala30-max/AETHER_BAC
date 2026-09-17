import { NotebooksService } from './notebooks.service';
import { CreateNotebookDto, UpdateNotebookDto, ReorderNotebooksDto } from './notebooks.dto';

export class NotebooksController {
  constructor(private readonly notebooksService: NotebooksService) {}

  async create(req: { body: CreateNotebookDto; user: { id: string } }) {
    return this.notebooksService.createNotebook(req.body, req.user.id);
  }

  async list(req: { user: { id: string } }) {
    return this.notebooksService.listNotebooks(req.user.id);
  }

  async findOne(req: { params: { id: string }; user: { id: string } }) {
    return this.notebooksService.getNotebook(req.params.id, req.user.id);
  }

  async update(req: { params: { id: string }; body: UpdateNotebookDto; user: { id: string } }) {
    return this.notebooksService.updateNotebook(req.params.id, req.body, req.user.id);
  }

  async reorder(req: { body: ReorderNotebooksDto; user: { id: string } }) {
    await this.notebooksService.reorderNotebooks(req.body, req.user.id);
    return { success: true };
  }

  async remove(req: { params: { id: string }; user: { id: string } }) {
    const deleted = await this.notebooksService.deleteNotebook(req.params.id, req.user.id);
    return { success: deleted };
  }
}
