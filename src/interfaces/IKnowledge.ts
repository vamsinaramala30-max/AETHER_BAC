export interface IDocument {
  id: string;
  knowledgeBaseId: string;
  fileName: string;
  fileUrl: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

export interface IKnowledgeBase {
  id: string;
  workspaceId: string;
  name: string;
  documents?: IDocument[];
  createdAt: Date;
  updatedAt: Date;
}
