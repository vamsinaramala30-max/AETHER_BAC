import { RetrievalService } from './retrieval.service';
import { RerankerService } from './reranker.service';
import { KnowledgeChunk, Citation } from './rag.entity';

export class RagService {
  constructor(
    private retrievalService: RetrievalService,
    private rerankerService: RerankerService,
  ) {}

  public async buildAugmentedContext(
    query: string,
  ): Promise<{ contextText: string; citations: Citation[] }> {
    const rawChunks = await this.retrievalService.fetchContextChunks(query);
    const reranked = await this.rerankerService.rerank(query, rawChunks);

    const contextText = reranked.map((c) => c.content).join('\n---\n');
    const citations: Citation[] = reranked.map((c) => ({
      chunkId: c.id,
      documentId: c.documentId,
      snippet: c.content.substring(0, 100),
    }));

    return { contextText, citations };
  }
}
