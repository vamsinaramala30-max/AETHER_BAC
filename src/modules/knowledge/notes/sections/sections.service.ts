import { SectionsRepository } from './sections.repository';
import { NotebooksRepository } from '../notebooks/notebooks.repository';
import { CreateSectionDto, UpdateSectionDto, ReorderSectionsDto, MoveSectionDto } from './sections.dto';
import { SectionEntity } from './sections.entity';

export class SectionsService {
  constructor(
    private readonly sectionsRepository: SectionsRepository,
    private readonly notebooksRepository: NotebooksRepository,
  ) {}

  private async assertNotebookOwned(notebookId: string, userId: string) {
    const notebook = await this.notebooksRepository.findById(notebookId, userId);
    if (!notebook) throw new Error(`Notebook ${notebookId} not found or access denied.`);
  }

  async createSection(
    notebookId: string,
    dto: CreateSectionDto,
    userId: string,
  ): Promise<SectionEntity> {
    await this.assertNotebookOwned(notebookId, userId);
    return this.sectionsRepository.create(userId, notebookId, dto);
  }

  async listSections(notebookId: string, userId: string): Promise<SectionEntity[]> {
    await this.assertNotebookOwned(notebookId, userId);
    return this.sectionsRepository.findAllForNotebook(notebookId, userId);
  }

  async getSection(id: string, userId: string): Promise<SectionEntity> {
    const section = await this.sectionsRepository.findById(id, userId);
    if (!section) throw new Error(`Section ${id} not found.`);
    return section;
  }

  async updateSection(id: string, dto: UpdateSectionDto, userId: string): Promise<SectionEntity> {
    const updated = await this.sectionsRepository.update(id, userId, dto);
    if (!updated) throw new Error(`Section ${id} not found or access denied.`);
    return updated;
  }

  async moveSection(id: string, dto: MoveSectionDto, userId: string): Promise<SectionEntity> {
    const moved = await this.sectionsRepository.move(id, userId, dto.targetNotebookId);
    if (!moved) throw new Error('Move failed: section or target notebook not found.');
    return moved;
  }

  async reorderSections(dto: ReorderSectionsDto, userId: string): Promise<void> {
    await this.assertNotebookOwned(dto.notebookId, userId);
    await this.sectionsRepository.reorder(userId, dto.notebookId, dto.orderedIds);
  }

  async deleteSection(id: string, userId: string): Promise<boolean> {
    await this.getSection(id, userId);
    return this.sectionsRepository.softDelete(id, userId);
  }
}
