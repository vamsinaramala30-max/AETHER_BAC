/**
 * AETHER AI — Citation Builder
 * Generates structured, verifiable citations from retrieved documents.
 * Never invents citations — all data comes from actual retrieved chunks.
 */

import { randomUUID } from 'crypto';
import type { Citation, RetrievedDocument } from '../../ai-types.js';

// ─── ICitationBuilder Interface ───────────────────────────────────────────────

export interface ICitationBuilder {
  buildCitations(documents: readonly RetrievedDocument[]): readonly Citation[];
  formatInlineCitation(citation: Citation, index: number): string;
  formatCitationList(citations: readonly Citation[]): string;
}

// ─── Citation Builder Implementation ──────────────────────────────────────────

export class CitationBuilder implements ICitationBuilder {
  public buildCitations(documents: readonly RetrievedDocument[]): readonly Citation[] {
    return documents.map((doc) => this.buildSingle(doc));
  }

  public formatInlineCitation(citation: Citation, index: number): string {
    return `[${index + 1}]`;
  }

  public formatCitationList(citations: readonly Citation[]): string {
    if (citations.length === 0) return '';
    const lines = citations.map((citation, index) => {
      const parts: string[] = [`[${index + 1}]`];
      parts.push(citation.title);
      if (citation.source) parts.push(`Source: ${citation.source}`);
      if (citation.pageNumber !== undefined) parts.push(`Page: ${citation.pageNumber}`);
      parts.push(`Excerpt: "${citation.excerpt.slice(0, 120)}..."`);
      parts.push(`Relevance: ${(citation.relevanceScore * 100).toFixed(0)}%`);
      return parts.join(' | ');
    });
    return '\n\nReferences:\n' + lines.join('\n');
  }

  private buildSingle(doc: RetrievedDocument): Citation {
    return {
      id: randomUUID(),
      documentId: doc.documentId,
      chunkId: doc.chunkId,
      title: String(doc.metadata.title ?? doc.documentId),
      source: String(doc.metadata.source ?? doc.documentId),
      pageNumber: typeof doc.metadata.pageNumber === 'number' ? doc.metadata.pageNumber : undefined,
      excerpt: doc.content.slice(0, 200).replace(/\s+/g, ' ').trim(),
      relevanceScore: doc.score,
    };
  }
}
