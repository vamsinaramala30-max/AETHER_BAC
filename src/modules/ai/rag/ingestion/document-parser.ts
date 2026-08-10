/**
 * AETHER AI — Document Parser
 * Extracts plain text from raw documents.
 * Supports text formats natively. PDF/DOCX require external libraries.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { RAGFailedError } from '../../ai-errors.js';
import type { RawDocument, ParsedDocument } from '../rag-types.js';

// ─── IDocumentParser Interface ────────────────────────────────────────────────

export interface IDocumentParser {
  parse(document: RawDocument): Promise<Result<ParsedDocument>>;
  supports(mimeType: string): boolean;
}

// ─── Plain Text Parser ────────────────────────────────────────────────────────

class PlainTextParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return (
      mimeType === 'text/plain' ||
      mimeType === 'text/markdown' ||
      mimeType === 'text/csv'
    );
  }

  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const text =
        typeof document.content === 'string'
          ? document.content
          : document.content.toString('utf-8');

      if (!text || text.trim().length === 0) {
        return fail(new RAGFailedError('parse', `Document "${document.id}" produced empty text`));
      }

      return ok({
        id: document.id,
        text,
        metadata: document.metadata,
        parsedAt: Date.now(),
      });
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(new RAGFailedError('parse', error instanceof Error ? error.message : String(error), cause));
    }
  }
}

// ─── JSON Parser ──────────────────────────────────────────────────────────────

class JSONParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return mimeType === 'application/json';
  }

  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawText =
        typeof document.content === 'string'
          ? document.content
          : document.content.toString('utf-8');

      const parsed: unknown = JSON.parse(rawText);
      const text = this.flattenToText(parsed);

      if (!text || text.trim().length === 0) {
        return fail(
          new RAGFailedError('parse', `JSON document "${document.id}" produced no extractable text`),
        );
      }

      return ok({
        id: document.id,
        text,
        metadata: document.metadata,
        parsedAt: Date.now(),
      });
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(new RAGFailedError('parse', error instanceof Error ? error.message : String(error), cause));
    }
  }

  private flattenToText(value: unknown, depth = 0): string {
    if (depth > 10) return '';
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      return value.map((v) => this.flattenToText(v, depth + 1)).join('\n');
    }
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${this.flattenToText(v, depth + 1)}`)
        .join('\n');
    }
    return '';
  }
}

// ─── HTML Parser ──────────────────────────────────────────────────────────────

class HTMLParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return mimeType === 'text/html';
  }

  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawText =
        typeof document.content === 'string'
          ? document.content
          : document.content.toString('utf-8');

      // Strip HTML tags to extract plain text
      const text = rawText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!text || text.length === 0) {
        return fail(new RAGFailedError('parse', `HTML document "${document.id}" produced no text`));
      }

      return ok({
        id: document.id,
        text,
        metadata: document.metadata,
        parsedAt: Date.now(),
      });
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(new RAGFailedError('parse', error instanceof Error ? error.message : String(error), cause));
    }
  }
}

// ─── Composite Document Parser ────────────────────────────────────────────────

export class DocumentParser implements IDocumentParser {
  private readonly parsers: IDocumentParser[];

  constructor() {
    this.parsers = [new PlainTextParser(), new JSONParser(), new HTMLParser()];
  }

  public supports(mimeType: string): boolean {
    return this.parsers.some((p) => p.supports(mimeType));
  }

  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    const parser = this.parsers.find((p) => p.supports(document.mimeType));
    if (!parser) {
      return fail(
        new RAGFailedError(
          'parse',
          `No parser available for MIME type "${document.mimeType}". ` +
            `Supported types: text/plain, text/markdown, text/csv, text/html, application/json.`,
        ),
      );
    }
    return parser.parse(document);
  }
}
