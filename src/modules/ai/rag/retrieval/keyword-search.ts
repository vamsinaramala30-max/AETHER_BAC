/**
 * AETHER AI — Keyword Search
 * BM25-inspired term-frequency keyword index for hybrid search.
 * Operates purely in-memory. No cloud APIs.
 */

import type { IKeywordIndex, KeywordSearchResult, DocumentChunk } from '../rag-types.js';
import type { ChunkId } from '../../ai-types.js';

// ─── Term Index Entry ─────────────────────────────────────────────────────────

interface TermEntry {
  readonly chunkId: ChunkId;
  readonly documentId: string;
  readonly termFrequency: number;
  readonly collectionId?: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
}

// ─── In-Memory Keyword Index ──────────────────────────────────────────────────

export class InMemoryKeywordIndex implements IKeywordIndex {
  // term → list of (chunkId, tf, documentId)
  private readonly invertedIndex = new Map<string, TermEntry[]>();
  // chunkId → term count (document length)
  private readonly docLengths = new Map<ChunkId, number>();
  // chunkId → documentId
  private readonly chunkDocs = new Map<ChunkId, string>();
  // chunkId → collectionId
  private readonly chunkCollections = new Map<ChunkId, string | undefined>();

  private readonly k1 = 1.5;
  private readonly b = 0.75;

  public async index(chunks: readonly DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      const terms = this.tokenize(chunk.text);
      const termFreqMap = this.computeTermFrequency(terms);

      this.docLengths.set(chunk.id, terms.length);
      this.chunkDocs.set(chunk.id, chunk.documentId);
      this.chunkCollections.set(chunk.id, chunk.metadata.collectionId);

      const userId = chunk.userId || (chunk.metadata?.userId as string | undefined);
      const workspaceId = chunk.workspaceId || (chunk.metadata?.workspaceId as string | undefined);
      const projectId = chunk.projectId || (chunk.metadata?.projectId as string | undefined);

      for (const [term, tf] of termFreqMap) {
        const existing = this.invertedIndex.get(term) ?? [];
        existing.push({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          termFrequency: tf,
          collectionId: chunk.metadata.collectionId,
          userId,
          workspaceId,
          projectId,
        });
        this.invertedIndex.set(term, existing);
      }
    }
  }

  public async search(
    query: string,
    topK: number,
    collectionIds?: readonly string[],
    scope?: {
      userId?: string;
      workspaceId?: string;
      projectId?: string;
      collectionIds?: readonly string[];
    },
  ): Promise<readonly KeywordSearchResult[]> {
    if (!query || query.trim().length === 0) return [];

    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const effectiveCollectionIds = scope?.collectionIds ?? collectionIds;
    const scores = new Map<ChunkId, number>();
    const matchedTermsMap = new Map<ChunkId, Set<string>>();
    const N = this.docLengths.size;
    const avgDocLength = this.computeAvgDocLength();

    for (const term of new Set(queryTerms)) {
      const postings = this.invertedIndex.get(term) ?? [];

      // Filter by collection and multi-tenant scopes
      const filteredPostings = postings.filter((p) => {
        if (scope?.userId && p.userId && p.userId !== scope.userId) return false;
        if (scope?.workspaceId && p.workspaceId && p.workspaceId !== scope.workspaceId) return false;
        if (scope?.projectId && p.projectId && p.projectId !== scope.projectId) return false;
        if (
          effectiveCollectionIds &&
          effectiveCollectionIds.length > 0 &&
          (!p.collectionId || !effectiveCollectionIds.includes(p.collectionId))
        ) {
          return false;
        }
        return true;
      });

      if (filteredPostings.length === 0) continue;

      const df = filteredPostings.length;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const posting of filteredPostings) {
        const docLen = this.docLengths.get(posting.chunkId) ?? 1;
        const tf = posting.termFrequency;
        const tfNorm =
          (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLen / avgDocLength)));
        const bm25 = idf * tfNorm;

        scores.set(posting.chunkId, (scores.get(posting.chunkId) ?? 0) + bm25);

        const terms = matchedTermsMap.get(posting.chunkId) ?? new Set();
        terms.add(term);
        matchedTermsMap.set(posting.chunkId, terms);
      }
    }

    const results: KeywordSearchResult[] = [];
    for (const [chunkId, score] of scores) {
      results.push({
        chunkId,
        documentId: this.chunkDocs.get(chunkId) ?? '',
        score,
        matchedTerms: [...(matchedTermsMap.get(chunkId) ?? [])],
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  public async delete(chunkIds: readonly ChunkId[]): Promise<void> {
    const toDelete = new Set(chunkIds);
    for (const [term, postings] of this.invertedIndex) {
      const filtered = postings.filter((p) => !toDelete.has(p.chunkId));
      if (filtered.length === 0) {
        this.invertedIndex.delete(term);
      } else {
        this.invertedIndex.set(term, filtered);
      }
    }
    for (const id of chunkIds) {
      this.docLengths.delete(id);
      this.chunkDocs.delete(id);
      this.chunkCollections.delete(id);
    }
  }

  public async deleteByDocument(documentId: string): Promise<void> {
    const toDelete: ChunkId[] = [];
    for (const [chunkId, docId] of this.chunkDocs) {
      if (docId === documentId) toDelete.push(chunkId);
    }
    await this.delete(toDelete);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private computeTermFrequency(terms: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const term of terms) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
    return freq;
  }

  private computeAvgDocLength(): number {
    if (this.docLengths.size === 0) return 1;
    let total = 0;
    for (const len of this.docLengths.values()) total += len;
    return total / this.docLengths.size;
  }
}
