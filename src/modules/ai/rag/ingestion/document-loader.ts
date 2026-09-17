/**
 * AETHER AI — Document Loader
 * Loads raw documents from various sources.
 * Never invents document content.
 */

import { randomUUID } from 'crypto';
import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { RAGFailedError } from '../../ai-errors.js';
import type { RawDocument } from '../rag-types.js';
import type { DocumentMetadata } from '../../ai-types.js';

// ─── Document Source Types ────────────────────────────────────────────────────

export interface BufferDocumentSource {
  readonly type: 'buffer';
  readonly content: Buffer;
  readonly mimeType: string;
  readonly filename: string;
  readonly metadata?: Partial<DocumentMetadata>;
}

export interface TextDocumentSource {
  readonly type: 'text';
  readonly content: string;
  readonly filename?: string;
  readonly id?: string;
  readonly title?: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly metadata?: Partial<DocumentMetadata>;
}

export type DocumentSource = BufferDocumentSource | TextDocumentSource;

// ─── IDocumentLoader Interface ────────────────────────────────────────────────

export interface IDocumentLoader {
  load(source: DocumentSource): Promise<Result<RawDocument>>;
  loadMany(sources: readonly DocumentSource[]): Promise<readonly Result<RawDocument>[]>;
}

// ─── Document Loader Implementation ──────────────────────────────────────────

export class DocumentLoader implements IDocumentLoader {
  private readonly supportedMimeTypes = new Set([
    'text/plain',
    'text/markdown',
    'text/html',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ]);

  public async load(source: DocumentSource): Promise<Result<RawDocument>> {
    try {
      switch (source.type) {
        case 'text':
          return this.loadText(source);
        case 'buffer':
          return this.loadBuffer(source);
        default: {
          const exhaustive: never = source;
          return fail(
            new RAGFailedError(
              'load',
              `Unknown document source type: ${JSON.stringify(exhaustive)}`,
            ),
          );
        }
      }
    } catch (error) {
      const cause = error instanceof Error ? error : undefined;
      return fail(
        new RAGFailedError('load', error instanceof Error ? error.message : String(error), cause),
      );
    }
  }

  public async loadMany(
    sources: readonly DocumentSource[],
  ): Promise<readonly Result<RawDocument>[]> {
    return Promise.all(sources.map((s) => this.load(s)));
  }

  private loadText(source: TextDocumentSource): Result<RawDocument> {
    if (!source.content || source.content.trim().length === 0) {
      return fail(new RAGFailedError('load', 'Document content is empty'));
    }

    const metadata: DocumentMetadata = {
      title: source.title ?? source.filename ?? 'Untitled',
      source: source.filename,
      createdAt: Date.now(),
      ...(source.userId ? { userId: source.userId } : {}),
      ...(source.workspaceId ? { workspaceId: source.workspaceId } : {}),
      ...source.metadata,
    };

    return ok({
      id: source.id ?? randomUUID(),
      content: source.content,
      mimeType: 'text/plain',
      filename: source.filename,
      metadata,
      loadedAt: Date.now(),
    });
  }

  private loadBuffer(source: BufferDocumentSource): Result<RawDocument> {
    if (!this.supportedMimeTypes.has(source.mimeType)) {
      return fail(
        new RAGFailedError(
          'load',
          `Unsupported MIME type "${source.mimeType}". Supported types: ${[...this.supportedMimeTypes].join(', ')}`,
        ),
      );
    }

    if (!source.content || source.content.length === 0) {
      return fail(new RAGFailedError('load', 'Document buffer is empty'));
    }

    const metadata: DocumentMetadata = {
      title: source.filename,
      source: source.filename,
      createdAt: Date.now(),
      ...source.metadata,
    };

    return ok({
      id: randomUUID(),
      content: source.content,
      mimeType: source.mimeType,
      filename: source.filename,
      metadata,
      loadedAt: Date.now(),
    });
  }
}
