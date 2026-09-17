import { NotebooksRepository } from './notebooks.repository';
import { SectionsRepository } from '../sections/sections.repository';
import { CreateNotebookDto, UpdateNotebookDto, ReorderNotebooksDto } from './notebooks.dto';
import { NotebookEntity } from './notebooks.entity';

export class NotebooksService {
  constructor(
    private readonly notebooksRepository: NotebooksRepository,
    private readonly sectionsRepository: SectionsRepository,
  ) {}

  async createNotebook(dto: CreateNotebookDto, userId: string): Promise<NotebookEntity> {
    const notebook = await this.notebooksRepository.create(userId, dto);
    // Every notebook starts with one section so a fresh notebook is
    // immediately writable, matching the OneNote mental model in the spec.
    await this.sectionsRepository.create(userId, notebook.id, { name: 'General' });
    return notebook;
  }

  async listNotebooks(userId: string): Promise<NotebookEntity[]> {
    return this.notebooksRepository.findAllForUser(userId);
  }

  async getNotebook(id: string, userId: string): Promise<NotebookEntity> {
    const notebook = await this.notebooksRepository.findById(id, userId);
    if (!notebook) throw new Error(`Notebook ${id} not found.`);
    return notebook;
  }

  async updateNotebook(id: string, dto: UpdateNotebookDto, userId: string): Promise<NotebookEntity> {
    const updated = await this.notebooksRepository.update(id, userId, dto);
    if (!updated) throw new Error(`Notebook ${id} not found or access denied.`);
    return updated;
  }

  async reorderNotebooks(dto: ReorderNotebooksDto, userId: string): Promise<void> {
    await this.notebooksRepository.reorder(userId, dto.orderedIds);
  }

  async deleteNotebook(id: string, userId: string): Promise<boolean> {
    await this.getNotebook(id, userId); // ownership check, throws if not owned
    return this.notebooksRepository.softDelete(id, userId);
  }
}
