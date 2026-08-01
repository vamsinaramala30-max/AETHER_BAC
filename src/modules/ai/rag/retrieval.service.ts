import { KnowledgeChunk } from './rag.entity';

export class RetrievalService {
  public async fetchContextChunks(query: string): Promise<KnowledgeChunk[]> {
    return [
      {
        id: 'chunk_1',
        documentId: 'doc_alpha',
        content: `Relevant system context snippet for query: ${query}`,
        score: 0.89,
      },
      {
        id: 'chunk_2',
        documentId: 'doc_beta',
        content: `Supplementary knowledge baseline for context expansion.`,
        score: 0.76,
      },
    ];
  }
}