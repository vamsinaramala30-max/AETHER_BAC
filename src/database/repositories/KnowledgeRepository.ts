import { KnowledgeBase, Document, Prisma } from '@prisma/client';
import { PrismaService, TransactionClient } from '../prisma';

export class KnowledgeRepository extends PrismaService {
  public async findById(id: string, tx?: TransactionClient): Promise<KnowledgeBase | null> {
    const client = tx || this.prisma;
    return client.knowledgeBase.findUnique({
      where: { id },
      include: { documents: true },
    });
  }

  public async findByWorkspaceId(workspaceId: string): Promise<KnowledgeBase[]> {
    return this.prisma.knowledgeBase.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async createBase(data: Prisma.KnowledgeBaseCreateInput, tx?: TransactionClient): Promise<KnowledgeBase> {
    const client = tx || this.prisma;
    return client.knowledgeBase.create({
      data,
    });
  }

  public async addDocument(data: Prisma.DocumentCreateInput, tx?: TransactionClient): Promise<Document> {
    const client = tx || this.prisma;
    return client.document.create({
      data,
    });
  }

  public async updateDocumentStatus(
    documentId: string,
    status: string,
    tx?: TransactionClient
  ): Promise<Document> {
    const client = tx || this.prisma;
    return client.document.update({
      where: { id: documentId },
      data: { status },
    });
  }

  public async deleteBase(id: string, tx?: TransactionClient): Promise<KnowledgeBase> {
    const client = tx || this.prisma;
    return client.knowledgeBase.delete({
      where: { id },
    });
  }
}