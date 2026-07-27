export enum KnowledgeEventType {
  BASE_CREATED = 'knowledge.base_created',
  BASE_DELETED = 'knowledge.base_deleted',
  DOCUMENT_INGESTED = 'knowledge.document_ingested',
  DOCUMENT_FAILED = 'knowledge.document_failed',
}

export interface KnowledgeDocumentIngestedPayload {
  documentId: string;
  knowledgeBaseId: string;
  chunkCount: number;
  ingestedAt: Date;
}
