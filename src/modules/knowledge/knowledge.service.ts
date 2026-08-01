import { NotesService } from './notes/notes.service';
import { DocumentsService } from './documents/documents.service';
import { KnowledgeBaseService } from './knowledge-base/knowledge-base.service';
import { SearchService } from './search/search.service';
import { UploadsService } from './uploads/uploads.service';
import { IndexingService } from './indexing/indexing.service';
import { KnowledgeRepository } from './knowledge.repository';

export class KnowledgeService {
  public readonly notesService: NotesService;
  public readonly documentsService: DocumentsService;
  public readonly knowledgeBaseService: KnowledgeBaseService;
  public readonly searchService: SearchService;
  public readonly uploadsService: UploadsService;
  public readonly indexingService: IndexingService;

  constructor(private readonly mainRepository: KnowledgeRepository) {
    this.notesService = new NotesService(this.mainRepository.notes);
    this.documentsService = new DocumentsService(this.mainRepository.documents);
    this.knowledgeBaseService = new KnowledgeBaseService(this.mainRepository.knowledgeBase);
    this.searchService = new SearchService(this.mainRepository.search);
    this.uploadsService = new UploadsService(this.mainRepository.uploads);
    this.indexingService = new IndexingService(this.mainRepository.indexing);
  }

  async getDashboardAnalytics(userId: string) {
    const notes = await this.notesService.listNotes({ limit: 1 }, userId);
    const docs = await this.documentsService.listDocuments({ limit: 1 }, userId);

    return {
      totalNotesCount: notes.total,
      totalDocumentsCount: docs.total,
      systemHealth: 'HEALTHY',
    };
  }
}