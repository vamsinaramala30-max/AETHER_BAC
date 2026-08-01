import { NotesRepository } from './notes/notes.repository';
import { DocumentsRepository } from './documents/documents.repository';
import { KnowledgeBaseRepository } from './knowledge-base/knowledge-base.repository';
import { SearchRepository } from './search/search.repository';
import { UploadsRepository } from './uploads/uploads.repository';
import { IndexingRepository } from './indexing/indexing.repository';

export class KnowledgeRepository {
  public readonly notes = new NotesRepository();
  public readonly documents = new DocumentsRepository();
  public readonly knowledgeBase = new KnowledgeBaseRepository();
  public readonly search = new SearchRepository();
  public readonly uploads = new UploadsRepository();
  public readonly indexing = new IndexingRepository();
}