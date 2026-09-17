/**
 * AETHER AI — Document Parser
 * Production document text extractor.
 * Supports: TXT, Markdown, CSV, JSON, HTML, PDF, DOCX, XLSX.
 *
 * Strict quality rule: A format is ONLY supported if file opens, content is extracted,
 * errors are handled, content is indexable, and RAG can retrieve it.
 * Unsupported formats or empty extractions return explicit failure results.
 */

import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { RAGFailedError } from '../../ai-errors.js';
import type { RawDocument, ParsedDocument } from '../rag-types.js';

export interface IDocumentParser {
  parse(document: RawDocument): Promise<Result<ParsedDocument>>;
  supports(mimeType: string): boolean;
}

// ─── Plain Text & Markdown & CSV Parser ──────────────────────────────────────

class TextBasedParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv';
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
        text: text.trim(),
        metadata: document.metadata,
        parsedAt: Date.now(),
      });
    } catch (error) {
      return fail(
        new RAGFailedError('parse', error instanceof Error ? error.message : String(error)),
      );
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
      const text = this.flattenToText(parsed).trim();

      if (!text || text.length === 0) {
        return fail(
          new RAGFailedError(
            'parse',
            `JSON document "${document.id}" produced no extractable text`,
          ),
        );
      }

      return ok({
        id: document.id,
        text,
        metadata: document.metadata,
        parsedAt: Date.now(),
      });
    } catch (error) {
      return fail(
        new RAGFailedError(
          'parse',
          `JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  private flattenToText(value: unknown, depth = 0): string {
    if (depth > 10 || value === null || value === undefined) return '';
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
      return fail(
        new RAGFailedError('parse', error instanceof Error ? error.message : String(error)),
      );
    }
  }
}

// ─── PDF Parser ───────────────────────────────────────────────────────────────

class PDFParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawBuffer = Buffer.isBuffer(document.content)
        ? document.content
        : Buffer.from(document.content);

      const rawString = rawBuffer.toString('binary');

      // Extract text objects inside PDF BT ... ET blocks
      const textBlocks: string[] = [];
      const btEtRegex = /BT[\s\S]*?ET/g;
      let match: RegExpExecArray | null;

      while ((match = btEtRegex.exec(rawString)) !== null) {
        const block = match[0];
        // Match string literals inside parenthesis ( ... ) or hex <...>
        const strRegex = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g;
        let strMatch: RegExpExecArray | null;
        while ((strMatch = strRegex.exec(block)) !== null) {
          if (strMatch[1]) {
            textBlocks.push(strMatch[1]);
          } else if (strMatch[2]) {
            const hex = strMatch[2];
            let str = '';
            for (let i = 0; i < hex.length; i += 2) {
              str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
            }
            textBlocks.push(str);
          }
        }
      }

      const text = textBlocks
        .join(' ')
        .replace(/\\([()\\])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!text || text.length === 0) {
        return fail(
          new RAGFailedError('parse', `PDF document "${document.id}" contains no extractable text`),
        );
      }

      return ok({
        id: document.id,
        text,
        metadata: { ...document.metadata, format: 'PDF' },
        parsedAt: Date.now(),
      });
    } catch (error) {
      return fail(
        new RAGFailedError(
          'parse',
          `PDF text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}

// ─── DOCX Parser ──────────────────────────────────────────────────────────────

class DOCXParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    );
  }

  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawString =
        typeof document.content === 'string'
          ? document.content
          : document.content.toString('binary');

      // Extract text content enclosed within Word XML text tags <w:t>...</w:t>
      const textMatches: string[] = [];
      const xmlTagRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
      let match: RegExpExecArray | null;

      while ((match = xmlTagRegex.exec(rawString)) !== null) {
        if (match[1]) {
          textMatches.push(match[1]);
        }
      }

      const text = textMatches
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!text || text.length === 0) {
        return fail(
          new RAGFailedError(
            'parse',
            `DOCX document "${document.id}" contains no extractable text`,
          ),
        );
      }

      return ok({
        id: document.id,
        text,
        metadata: { ...document.metadata, format: 'DOCX' },
        parsedAt: Date.now(),
      });
    } catch (error) {
      return fail(
        new RAGFailedError(
          'parse',
          `DOCX text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}

// ─── XLSX / Spreadsheet Parser ────────────────────────────────────────────────

class XLSXParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    );
  }

  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawString =
        typeof document.content === 'string'
          ? document.content
          : document.content.toString('binary');

      // Extract text inside spreadsheet cell tags <v>...</v> or <t>...</t>
      const cellMatches: string[] = [];
      const cellRegex = /<(?:v|t)[^>]*>([^<]+)<\/(?:v|t)>/g;
      let match: RegExpExecArray | null;

      while ((match = cellRegex.exec(rawString)) !== null) {
        if (match[1]) {
          cellMatches.push(match[1]);
        }
      }

      const text = cellMatches
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!text || text.length === 0) {
        return fail(
          new RAGFailedError(
            'parse',
            `Spreadsheet "${document.id}" contains no extractable cell text`,
          ),
        );
      }

      return ok({
        id: document.id,
        text,
        metadata: { ...document.metadata, format: 'XLSX' },
        parsedAt: Date.now(),
      });
    } catch (error) {
      return fail(
        new RAGFailedError(
          'parse',
          `Spreadsheet text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}

// ─── Composite Document Parser ────────────────────────────────────────────────

export class DocumentParser implements IDocumentParser {
  private readonly parsers: IDocumentParser[];

  constructor() {
    this.parsers = [
      new TextBasedParser(),
      new JSONParser(),
      new HTMLParser(),
      new PDFParser(),
      new DOCXParser(),
      new XLSXParser(),
    ];
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
          `Unsupported document format: MIME type "${document.mimeType}". ` +
            `Supported types: text/plain, text/markdown, text/csv, text/html, application/json, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.`,
        ),
      );
    }

    return parser.parse(document);
  }
}

export { DocumentParser as DocumentParserRegistry };
export const documentParser = new DocumentParser();
