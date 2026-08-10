/**
 * AETHER AI — Context Compressor
 * Reduces RAG context size by selecting the most relevant sentences.
 * No cloud AI required — pure statistical relevance scoring.
 */

import type { BuiltRAGContext } from '../rag-types.js';
import type { RetrievedDocument } from '../../ai-types.js';
import { defaultTokenizer } from '../../llm/tokenizer.js';

// ─── IContextCompressor Interface ─────────────────────────────────────────────

export interface IContextCompressor {
  compress(context: BuiltRAGContext, targetTokens: number, query: string): BuiltRAGContext;
}

// ─── Extractive Context Compressor ───────────────────────────────────────────

export class ExtractiveContextCompressor implements IContextCompressor {
  public compress(
    context: BuiltRAGContext,
    targetTokens: number,
    query: string,
  ): BuiltRAGContext {
    const currentTokens = context.estimatedTokens;
    if (currentTokens <= targetTokens) return context;

    const queryTerms = this.tokenize(query);
    const compressedDocs: RetrievedDocument[] = [];
    let usedTokens = 0;

    for (const doc of context.documents) {
      if (usedTokens >= targetTokens) break;

      const budget = targetTokens - usedTokens;
      const compressedContent = this.extractRelevantSentences(
        doc.content,
        queryTerms,
        budget,
      );

      if (!compressedContent || compressedContent.trim().length === 0) continue;

      const tokenCount = defaultTokenizer.count(compressedContent).tokenCount;
      compressedDocs.push({
        ...doc,
        content: compressedContent,
        citation: {
          ...doc.citation,
          excerpt: compressedContent.slice(0, 200),
        },
      });
      usedTokens += tokenCount;
    }

    return {
      documents: compressedDocs,
      citations: compressedDocs.map((d) => d.citation),
      totalRetrieved: context.totalRetrieved,
      searchQuery: context.searchQuery,
      estimatedTokens: usedTokens,
    };
  }

  private extractRelevantSentences(
    text: string,
    queryTerms: string[],
    maxTokens: number,
  ): string {
    const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) ?? [text];
    const queryTermSet = new Set(queryTerms);

    // Score each sentence by query term overlap
    const scored = sentences.map((sentence) => {
      const terms = this.tokenize(sentence);
      const overlap = terms.filter((t) => queryTermSet.has(t)).length;
      const score = terms.length > 0 ? overlap / terms.length : 0;
      return { sentence, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    let result = '';
    let usedTokens = 0;

    for (const { sentence } of scored) {
      const tokens = defaultTokenizer.count(sentence).tokenCount;
      if (usedTokens + tokens > maxTokens) break;
      result += sentence + ' ';
      usedTokens += tokens;
    }

    return result.trim();
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }
}
