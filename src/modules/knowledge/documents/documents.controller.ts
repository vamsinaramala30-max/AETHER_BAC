import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto, QueryDocumentsDto } from './documents.dto';

export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  async create(req: { body: CreateDocumentDto; user: { id: string }; headers?: any }) {
    const workspaceId =
      req.body?.workspaceId ||
      req.headers?.['x-workspace-id'] ||
      undefined;
    return this.documentsService.createDocument(req.body, req.user.id, workspaceId);
  }

  async findOne(req: { params: { id: string }; user: { id: string } }) {
    return this.documentsService.getDocument(req.params.id, req.user.id);
  }

  async update(req: { params: { id: string }; body: UpdateDocumentDto; user: { id: string } }) {
    return this.documentsService.updateDocument(req.params.id, req.body, req.user.id);
  }

  async list(req: { query: QueryDocumentsDto; user: { id: string }; headers?: any }) {
    const workspaceId =
      req.query?.workspaceId ||
      req.headers?.['x-workspace-id'] ||
      undefined;
    const query = { ...req.query, workspaceId };
    return this.documentsService.listDocuments(query, req.user.id);
  }

  async extractInfo(req: { params: { id: string }; user: { id: string } }) {
    return this.documentsService.extractInformation(req.params.id, req.user.id);
  }
}
