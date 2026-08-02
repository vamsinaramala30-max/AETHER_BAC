import { KnowledgeService } from './knowledge.service';
import { NotesController } from './notes/notes.controller';
import { DocumentsController } from './documents/documents.controller';
import { KnowledgeBaseController } from './knowledge-base/knowledge-base.controller';
import { SearchController } from './search/search.controller';
import { UploadsController } from './uploads/uploads.controller';
import { IndexingController } from './indexing/indexing.controller';

export class KnowledgeController {
  public readonly notes: NotesController;
  public readonly documents: DocumentsController;
  public readonly knowledgeBase: KnowledgeBaseController;
  public readonly search: SearchController;
  public readonly uploads: UploadsController;
  public readonly indexing: IndexingController;

  constructor(private readonly knowledgeService: KnowledgeService) {
    this.notes = new NotesController(this.knowledgeService.notesService);
    this.documents = new DocumentsController(this.knowledgeService.documentsService);
    this.knowledgeBase = new KnowledgeBaseController(this.knowledgeService.knowledgeBaseService);
    this.search = new SearchController(this.knowledgeService.searchService);
    this.uploads = new UploadsController(this.knowledgeService.uploadsService);
    this.indexing = new IndexingController(this.knowledgeService.indexingService);
  }

  async getDashboard(req: { user: { id: string } }) {
    return this.knowledgeService.getDashboardAnalytics(req.user.id);
  }
}
