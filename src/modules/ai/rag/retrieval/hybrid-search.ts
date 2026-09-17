/**
 * AETHER AI — Hybrid Search
 * Combines vector and keyword search using Reciprocal Rank Fusion (RRF).
 * alpha parameter controls vector vs keyword balance.
 */

import type { HybridSearchResult, VectorSearchResult, KeywordSearchResult } from '../rag-types.js';
import type { ChunkId } from '../../ai-types.js';

// ─── Hybrid Search Configuration ─────────────────────────────────────────────

export interface HybridSearchConfig {
  /** 0.0 = pure keyword, 1.0 = pure vector, 0.5 = balanced */
  readonly alpha: number;
  /** RRF constant (typically 60) */
  readonly rrfK: number;
}

const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  alpha: 0.5,
  rrfK: 60,
};

// ─── Hybrid Search ────────────────────────────────────────────────────────────

export class HybridSearch {
  private readonly config: HybridSearchConfig;

  constructor(config: Partial<HybridSearchConfig> = {}) {
    this.config = { ...DEFAULT_HYBRID_CONFIG, ...config };
  }

  /**
   * Fuses vector and keyword results using Reciprocal Rank Fusion.
   * Returns a unified ranking by combined score.
   */
  public fuse(
    vectorResults: readonly VectorSearchResult[],
    keywordResults: readonly KeywordSearchResult[],
    topK: number,
  ): readonly HybridSearchResult[] {
    const scoreMap = new Map<
      ChunkId,
      {
        documentId: string;
        vectorScore: number;
        keywordScore: number;
        rrfScore: number;
      }
    >();

    // Assign RRF scores from vector results
    for (let rank = 0; rank < vectorResults.length; rank++) {
      const result = vectorResults[rank]!;
      const rrfScore = 1 / (this.config.rrfK + rank + 1);
      const weighted = rrfScore * this.config.alpha;
      const existing = scoreMap.get(result.chunkId);
      if (existing) {
        existing.vectorScore = result.score;
        existing.rrfScore += weighted;
      } else {
        scoreMap.set(result.chunkId, {
          documentId: result.documentId,
          vectorScore: result.score,
          keywordScore: 0,
          rrfScore: weighted,
        });
      }
    }

    // Assign RRF scores from keyword results
    for (let rank = 0; rank < keywordResults.length; rank++) {
      const result = keywordResults[rank]!;
      const rrfScore = 1 / (this.config.rrfK + rank + 1);
      const weighted = rrfScore * (1 - this.config.alpha);
      const existing = scoreMap.get(result.chunkId);
      if (existing) {
        existing.keywordScore = result.score;
        existing.rrfScore += weighted;
      } else {
        scoreMap.set(result.chunkId, {
          documentId: result.documentId,
          vectorScore: 0,
          keywordScore: result.score,
          rrfScore: weighted,
        });
      }
    }

    // Sort by combined RRF score
    const fused: HybridSearchResult[] = [];
    for (const [chunkId, scores] of scoreMap) {
      fused.push({
        chunkId,
        documentId: scores.documentId,
        vectorScore: scores.vectorScore,
        keywordScore: scores.keywordScore,
        combinedScore: scores.rrfScore,
      });
    }

    fused.sort((a, b) => b.combinedScore - a.combinedScore);
    return fused.slice(0, topK);
  }
}
