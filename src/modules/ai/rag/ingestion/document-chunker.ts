/**
 * AETHER AI — Document Chunker
 * Splits cleaned documents into overlapping chunks for embedding.
 * Supports character-based, sentence-based, and paragraph-based strategies.
 */

import { randomUUID } from 'crypto';
import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { RAGFailedError } from '../../ai-errors.js';
import type { CleanedDocument, DocumentChunk } from '../rag-types.js';
import { CHUNKING } from '../../ai-constants.js';
import { defaultTokenizer } from '../../llm/tokenizer.js';

// ─── Chunking Strategy ────────────────────────────────────────────────────────

export type ChunkingStrategy = 'character' | 'sentence' | 'paragraph';

export interface ChunkingOptions {
  readonly strategy: ChunkingStrategy;
  readonly chunkSize: number;
  readonly chunkOverlap: number;
}

const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  strategy: 'paragraph',
  chunkSize: CHUNKING.DEFAULT_CHUNK_SIZE * CHUNKING.DEFAULT_CHUNK_SIZE, // ~chars, not tokens
  chunkOverlap: CHUNKING.DEFAULT_CHUNK_OVERLAP * 4, // chars
};

// ─── IDocumentChunker Interface ───────────────────────────────────────────────

export interface IDocumentChunker {
  chunk(
    document: CleanedDocument,
    options?: Partial<ChunkingOptions>,
  ): Result<readonly DocumentChunk[]>;
}

// ─── Document Chunker Implementation ──────────────────────────────────────────

export class DocumentChunker implements IDocumentChunker {
  private readonly defaults: ChunkingOptions;

  constructor(defaults: Partial<ChunkingOptions> = {}) {
    this.defaults = { ...DEFAULT_CHUNKING_OPTIONS, ...defaults };
  }

  public chunk(
    document: CleanedDocument,
    overrides: Partial<ChunkingOptions> = {},
  ): Result<readonly DocumentChunk[]> {
    const options: ChunkingOptions = { ...this.defaults, ...overrides };

    if (options.chunkSize < 64) {
      return fail(new RAGFailedError('chunk', 'chunkSize must be at least 64 characters'));
    }
    if (options.chunkOverlap >= options.chunkSize) {
      return fail(new RAGFailedError('chunk', 'chunkOverlap must be less than chunkSize'));
    }
    if (!document.text || document.text.trim().length === 0) {
      return fail(new RAGFailedError('chunk', `Document "${document.id}" has no text to chunk`));
    }

    try {
      let textSegments: string[];
      switch (options.strategy) {
        case 'paragraph':
          textSegments = this.splitByParagraph(document.text, options);
          break;
        case 'sentence':
          textSegments = this.splitBySentence(document.text, options);
          break;
        case 'character':
          textSegments = this.splitByCharacter(document.text, options);
          break;
        default: {
          const exhaustive: never = options.strategy;
          return fail(
            new RAGFailedError('chunk', `Unknown strategy: ${JSON.stringify(exhaustive)}`),
          );
        }
      }

      if (textSegments.length === 0) {
        return fail(new RAGFailedError('chunk', `Document "${document.id}" produced no chunks`));
      }

      const chunks: DocumentChunk[] = textSegments.map((text, index) => {
        const startOffset = document.text.indexOf(text);
        const tokenCount = defaultTokenizer.count(text).tokenCount;
        return {
          id: randomUUID(),
          documentId: document.id,
          text,
          chunkIndex: index,
          totalChunks: textSegments.length,
          startOffset: startOffset >= 0 ? startOffset : 0,
          endOffset: startOffset >= 0 ? startOffset + text.length : text.length,
          tokenCount,
          metadata: {
            ...document.metadata,
            chunkIndex: index,
            totalChunks: textSegments.length,
            tokenCount,
          },
        };
      });

      return ok(chunks);
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new RAGFailedError('chunk', error instanceof Error ? error.message : String(error), cause),
      );
    }
  }

  private splitByParagraph(text: string, options: ChunkingOptions): string[] {
    const paragraphs = text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    return this.mergeSegments(paragraphs, options.chunkSize, options.chunkOverlap);
  }

  private splitBySentence(text: string, options: ChunkingOptions): string[] {
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return this.mergeSegments(sentences, options.chunkSize, options.chunkOverlap);
  }

  private splitByCharacter(text: string, options: ChunkingOptions): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + options.chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += options.chunkSize - options.chunkOverlap;
    }

    return chunks.filter((c) => c.trim().length > 0);
  }

  /**
   * Merges small segments into chunks of target size with overlap.
   */
  private mergeSegments(segments: string[], chunkSize: number, chunkOverlap: number): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const segment of segments) {
      if (current.length + segment.length + 1 <= chunkSize) {
        current = current.length === 0 ? segment : `${current}\n\n${segment}`;
      } else {
        if (current.length > 0) {
          chunks.push(current);
          // Create overlap by keeping the tail of the current chunk
          const overlapText = current.slice(-chunkOverlap);
          current = `${overlapText}\n\n${segment}`.trim();
        } else {
          // Single segment exceeds chunkSize — split it by character
          const subChunks = this.splitByCharacter(segment, {
            strategy: 'character',
            chunkSize,
            chunkOverlap,
          });
          chunks.push(...subChunks.slice(0, -1));
          current = subChunks[subChunks.length - 1] ?? '';
        }
      }
    }

    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }

    return chunks;
  }
}
