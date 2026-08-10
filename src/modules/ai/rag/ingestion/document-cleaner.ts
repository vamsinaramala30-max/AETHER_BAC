/**
 * AETHER AI — Document Cleaner
 * Normalizes and cleans extracted document text before chunking.
 */

import type { ParsedDocument, CleanedDocument } from '../rag-types.js';
import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { RAGFailedError } from '../../ai-errors.js';

// ─── IDocumentCleaner Interface ───────────────────────────────────────────────

export interface IDocumentCleaner {
  clean(document: ParsedDocument): Result<CleanedDocument>;
}

// ─── Cleaning Rules ───────────────────────────────────────────────────────────

export interface CleaningOptions {
  readonly normalizeWhitespace: boolean;
  readonly removeControlCharacters: boolean;
  readonly normalizeUnicode: boolean;
  readonly removeDuplicateBlankLines: boolean;
  readonly minTextLength: number;
}

const DEFAULT_CLEANING_OPTIONS: CleaningOptions = {
  normalizeWhitespace: true,
  removeControlCharacters: true,
  normalizeUnicode: true,
  removeDuplicateBlankLines: true,
  minTextLength: 10,
};

// ─── Document Cleaner Implementation ─────────────────────────────────────────

export class DocumentCleaner implements IDocumentCleaner {
  private readonly options: CleaningOptions;

  constructor(options: Partial<CleaningOptions> = {}) {
    this.options = { ...DEFAULT_CLEANING_OPTIONS, ...options };
  }

  public clean(document: ParsedDocument): Result<CleanedDocument> {
    try {
      let text = document.text;

      if (this.options.removeControlCharacters) {
        // Remove non-printable control characters, keeping newlines and tabs
        text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      }

      if (this.options.normalizeUnicode) {
        // Normalize to NFC form for consistent Unicode representation
        text = text.normalize('NFC');
        // Replace smart quotes with straight quotes
        text = text
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/\u2013/g, '-')
          .replace(/\u2014/g, '--')
          .replace(/\u2026/g, '...');
      }

      if (this.options.normalizeWhitespace) {
        // Normalize horizontal whitespace but preserve line structure
        text = text
          .split('\n')
          .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
          .join('\n');
      }

      if (this.options.removeDuplicateBlankLines) {
        // Collapse 3+ consecutive blank lines into 2
        text = text.replace(/\n{3,}/g, '\n\n');
      }

      text = text.trim();

      if (text.length < this.options.minTextLength) {
        return fail(
          new RAGFailedError(
            'clean',
            `Document "${document.id}" text is too short after cleaning (${text.length} chars, minimum ${this.options.minTextLength})`,
          ),
        );
      }

      return ok({
        id: document.id,
        text,
        metadata: document.metadata,
        cleanedAt: Date.now(),
      });
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(new RAGFailedError('clean', error instanceof Error ? error.message : String(error), cause));
    }
  }
}
