/**
 * AETHER AI — RAG Prompts
 * Prompt templates for Retrieval-Augmented Generation contexts.
 */

import type { RetrievedDocument } from '../ai-types.js';

// ─── RAG Context Block ────────────────────────────────────────────────────────

export function buildRAGContextBlock(
  documents: readonly RetrievedDocument[],
): string {
  if (documents.length === 0) return '';

  const docBlocks = documents.map((doc, index) => {
    const title = doc.metadata.title ?? doc.documentId;
    const source = doc.metadata.source ?? doc.documentId;
    const page = doc.metadata.pageNumber !== undefined
      ? ` (page ${doc.metadata.pageNumber})`
      : '';

    return [
      `--- Document [${index + 1}]: ${title}${page} ---`,
      `Source: ${source}`,
      ``,
      doc.content,
      `---`,
    ].join('\n');
  });

  return [
    '=== Retrieved Documents ===',
    '',
    docBlocks.join('\n\n'),
    '',
    '=== End of Retrieved Documents ===',
  ].join('\n');
}

// ─── RAG Query Prompt ─────────────────────────────────────────────────────────

export function buildRAGQueryPrompt(
  userQuery: string,
  contextBlock: string,
): string {
  return [
    contextBlock,
    '',
    `User question: ${userQuery}`,
    '',
    'Based on the documents provided above, answer the user\'s question. ' +
      'If the answer is not in the documents, say so explicitly.',
  ].join('\n');
}

// ─── Citation Instruction ─────────────────────────────────────────────────────

export const RAG_CITATION_INSTRUCTION = `
When referencing information from the documents, use inline citation markers like [1], [2], etc., 
corresponding to the document numbers shown above.
Only cite documents that directly support your answer.
Do not cite documents that are not relevant to the answer.` as const;

// ─── No Results Prompt ────────────────────────────────────────────────────────

export function buildNoRAGResultsPrompt(userQuery: string): string {
  return (
    `No relevant documents were found in the knowledge base for: "${userQuery}".\n\n` +
    `Please inform the user that no relevant documents are available and answer based on general knowledge if possible.`
  );
}
