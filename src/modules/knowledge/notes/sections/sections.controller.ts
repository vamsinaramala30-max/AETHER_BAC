import { SectionsService } from './sections.service';
import { CreateSectionDto, UpdateSectionDto, ReorderSectionsDto, MoveSectionDto } from './sections.dto';

export class SectionsController {
  constructor(private readonly sectionsService: SectionsService) {}

  async create(req: {
    params: { notebookId: string };
    body: CreateSectionDto;
    user: { id: string };
  }) {
    return this.sectionsService.createSection(req.params.notebookId, req.body, req.user.id);
  }

  async list(req: { params: { notebookId: string }; user: { id: string } }) {
    return this.sectionsService.listSections(req.params.notebookId, req.user.id);
  }

  async findOne(req: { params: { id: string }; user: { id: string } }) {
    return this.sectionsService.getSection(req.params.id, req.user.id);
  }

  async update(req: { params: { id: string }; body: UpdateSectionDto; user: { id: string } }) {
    return this.sectionsService.updateSection(req.params.id, req.body, req.user.id);
  }

  async move(req: { params: { id: string }; body: MoveSectionDto; user: { id: string } }) {
    return this.sectionsService.moveSection(req.params.id, req.body, req.user.id);
  }

  async reorder(req: { body: ReorderSectionsDto; user: { id: string } }) {
    await this.sectionsService.reorderSections(req.body, req.user.id);
    return { success: true };
  }

  async remove(req: { params: { id: string }; user: { id: string } }) {
    const deleted = await this.sectionsService.deleteSection(req.params.id, req.user.id);
    return { success: deleted };
  }
}
