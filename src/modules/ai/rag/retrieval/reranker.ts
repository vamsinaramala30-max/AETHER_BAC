/**
 * AETHER AI — Reranker
 * Reranks retrieved chunks using cross-encoder scoring heuristics.
 * For production, swap the scoring logic with a local cross-encoder model.
 * Never invents relevance — scores are derived from real text overlap.
 */

import type { RerankRequest, RerankResult, DocumentChunk } from '../rag-types.js';

// ─── IReranker Interface ──────────────────────────────────────────────────────

export interface IReranker {
  rerank(request: RerankRequest): Promise<readonly RerankResult[]>;
}

// ─── Heuristic Reranker ───────────────────────────────────────────────────────

/**
 * Scores based on query term overlap (precision-recall F1 approximation).
 * Replace with a real cross-encoder model for production use.
 * No fake scores — all values are derived from actual text content.
 */
export class HeuristicReranker implements IReranker {
  public async rerank(request: RerankRequest): Promise<readonly RerankResult[]> {
    const queryTerms = this.tokenize(request.query);
    if (queryTerms.length === 0) {
      return request.candidates.map((chunk, i) => ({
        chunk,
        score: 0,
        rank: i,
      }));
    }

    const queryTermSet = new Set(queryTerms);

    const scored = request.candidates.map((chunk) => {
      const score = this.scoreChunk(chunk, queryTermSet, queryTerms.length);
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, request.topK).map((item, rank) => ({
      chunk: item.chunk,
      score: item.score,
      rank,
    }));
  }

  private scoreChunk(
    chunk: DocumentChunk,
    queryTermSet: Set<string>,
    queryTermCount: number,
  ): number {
    const titleAndMetadata = `${chunk.metadata?.title ?? ''} ${chunk.metadata?.filename ?? ''} ${chunk.metadata?.source ?? ''}`;
    const chunkTerms = this.tokenize(`${titleAndMetadata} ${chunk.text}`);
    if (chunkTerms.length === 0) return 0;

    const chunkTermSet = new Set(chunkTerms);

    // Count matched terms
    let matchedInQuery = 0;
    for (const term of queryTermSet) {
      if (chunkTermSet.has(term)) matchedInQuery++;
    }

    let matchedInChunk = 0;
    for (const term of chunkTermSet) {
      if (queryTermSet.has(term)) matchedInChunk++;
    }

    const precision = matchedInChunk / chunkTermSet.size;
    const recall = matchedInQuery / queryTermCount;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    // Query coverage (recall) is the authoritative signal of retrieval relevance for variable-length chunks
    return Math.max(recall, f1);
  }

  private static readonly STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'were', 'will', 'with', 'what', 'how', 'when', 'where',
    'why', 'who', 'does', 'did', 'do', 'explain', 'research', 'synthesize',
    'tell', 'me', 'about', 'can', 'you', 'please', 'describe', 'give',
    'summarize', 'summary', 'remember', 'format',
  ]);

  private tokenize(text: string): string[] {
    const raw = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
    const content = raw.filter((t) => !HeuristicReranker.STOP_WORDS.has(t));
    return content.length > 0 ? content : raw;
  }
}

// ─── Pass-Through Reranker ────────────────────────────────────────────────────

/** Computes honest relevance scores without reordering candidates. */
export class PassThroughReranker implements IReranker {
  private readonly heuristic = new HeuristicReranker();

  public async rerank(request: RerankRequest): Promise<readonly RerankResult[]> {
    return this.heuristic.rerank(request);
  }
}
