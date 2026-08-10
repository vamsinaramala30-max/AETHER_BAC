/**
 * AETHER AI — Context Builder
 * Assembles retrieved chunks into structured RAG context for the prompt engine.
 * Never invents citations or document content.
 */

import { randomUUID } from 'crypto';
import type { RetrievedDocument, Citation } from '../../ai-types.js';
import type { BuiltRAGContext, DocumentChunk } from '../rag-types.js';
import { defaultTokenizer } from '../../llm/tokenizer.js';

// ─── IContextBuilder Interface ────────────────────────────────────────────────

export interface IContextBuilder {
  build(
    query: string,
    chunks: readonly DocumentChunk[],
    maxTokens: number,
  ): BuiltRAGContext;
}

// ─── Context Builder Implementation ──────────────────────────────────────────

export class ContextBuilder implements IContextBuilder {
  public build(
    query: string,
    chunks: readonly DocumentChunk[],
    maxTokens: number,
  ): BuiltRAGContext {
    if (chunks.length === 0) {
      return {
        documents: [],
        citations: [],
        totalRetrieved: 0,
        searchQuery: query,
        estimatedTokens: 0,
      };
    }

    const documents: RetrievedDocument[] = [];
    const citations: Citation[] = [];
    let usedTokens = 0;

    for (const chunk of chunks) {
      const chunkTokens = defaultTokenizer.count(chunk.text).tokenCount;
      if (usedTokens + chunkTokens > maxTokens) break;

      const citationId = randomUUID();
      const citation: Citation = {
        id: citationId,
        documentId: chunk.documentId,
        chunkId: chunk.id,
        title: String(chunk.metadata.title ?? chunk.documentId),
        source: String(chunk.metadata.source ?? chunk.documentId),
        pageNumber: typeof chunk.metadata.pageNumber === 'number'
          ? chunk.metadata.pageNumber
          : undefined,
        excerpt: chunk.text.slice(0, 200),
        relevanceScore: typeof chunk.metadata.score === 'number'
          ? chunk.metadata.score
          : 0,
      };

      const retrieved: RetrievedDocument = {
        documentId: chunk.documentId,
        chunkId: chunk.id,
        content: chunk.text,
        score: typeof chunk.metadata.score === 'number' ? chunk.metadata.score : 0,
        metadata: chunk.metadata,
        citation,
      };

      documents.push(retrieved);
      citations.push(citation);
      usedTokens += chunkTokens;
    }

    return {
      documents,
      citations,
      totalRetrieved: chunks.length,
      searchQuery: query,
      estimatedTokens: usedTokens,
    };
  }
}
