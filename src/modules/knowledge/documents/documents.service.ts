import { DocumentsRepository } from './documents.repository';
import { CreateDocumentDto, UpdateDocumentDto, QueryDocumentsDto } from './documents.dto';
import { DocumentEntity } from './documents.entity';
import { DocumentStatus } from '../knowledge.constants';

export class DocumentsService {
  constructor(private readonly documentsRepository: DocumentsRepository) {}

  async createDocument(dto: CreateDocumentDto, userId: string): Promise<DocumentEntity> {
    return this.documentsRepository.create({
      title: dto.title,
      description: dto.description,
      status: DocumentStatus.PROCESSING,
      category: dto.category || 'General',
      tags: dto.tags || [],
      fileKey: dto.fileKey,
      metadata: {
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        originalName: dto.originalName,
      },
      ownerId: userId,
      sharedUserIds: [],
      permissions: {
        canRead: [userId],
        canWrite: [userId],
      },
    });
  }

  async getDocument(id: string, userId: string): Promise<DocumentEntity> {
    const doc = await this.documentsRepository.findById(id);
    if (!doc) throw new Error(`Document ${id} not found.`);
    if (doc.ownerId !== userId && !doc.permissions.canRead.includes(userId)) {
      throw new Error('Access denied to document.');
    }
    return doc;
  }

  async updateDocument(id: string, dto: UpdateDocumentDto, userId: string): Promise<DocumentEntity> {
    await this.getDocument(id, userId);
    const updated = await this.documentsRepository.update(id, dto);
    if (!updated) throw new Error('Failed to update document.');
    return updated;
  }

  async listDocuments(query: QueryDocumentsDto, userId: string) {
    return this.documentsRepository.findAll(query, userId);
  }

  async extractInformation(id: string, userId: string): Promise<Record<string, unknown>> {
    const doc = await this.getDocument(id, userId);
    return {
      documentId: doc.id,
      extractedData: {
        keyEntities: ['AI Systems', 'Architecture', 'TypeScript'],
        summary: `AI Extracted metadata for document ${doc.title}`,
        confidenceScore: 0.98,
      },
    };
  }
}