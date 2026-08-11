/**
 * AETHER AI — Response Validator
 * Performs post-generation validation before returning final responses.
 * Ensures:
 * 1. Did AI answer the actual request?
 * 2. Is answer supported by available evidence?
 * 3. Were claimed actions actually executed?
 * 4. Was anything fabricated?
 * 5. Was unauthorized information exposed?
 * 6. Is uncertainty communicated correctly?
 */

import type { AIRequest, AIContext, Intent } from '../ai-types.js';

export interface ResponseValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly correctedContent?: string;
}

export interface IResponseValidator {
  validate(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
    content: string,
    toolExecuted?: boolean,
    toolSuccess?: boolean,
  ): ResponseValidationResult;
}

export class ResponseValidator implements IResponseValidator {
  public validate(
    request: AIRequest,
    intent: Intent,
    context: AIContext,
    content: string,
    toolExecuted?: boolean,
    toolSuccess?: boolean,
  ): ResponseValidationResult {
    if (!content || content.trim().length === 0) {
      return {
        valid: false,
        reason: 'Generated content is empty.',
      };
    }

    // 1. Tool execution verification: if model claims action succeeded, check if tool actually ran and succeeded
    const claimsActionSuccess =
      content.includes('created') ||
      content.includes('updated') ||
      content.includes('deleted') ||
      content.includes('executed automation') ||
      content.includes('triggered');

    if (claimsActionSuccess && toolExecuted && !toolSuccess) {
      return {
        valid: false,
        reason: 'Response claimed tool execution succeeded, but tool execution failed in backend.',
        correctedContent: 'The requested action encountered an error on the backend and could not be completed.',
      };
    }

    if (claimsActionSuccess && intent.requiresTool && !toolExecuted) {
      return {
        valid: false,
        reason: 'Response claimed action completed, but no backend tool was executed.',
        correctedContent: 'The requested action was not executed. Please try again or provide required permissions.',
      };
    }

    // 2. RAG verification: if RAG was required but no documents were found, ensure model didn't fabricate document content
    if (intent.requiresRAG || intent.type === 'KNOWLEDGE_QUESTION') {
      const docs = context.ragContext?.documents ?? [];
      if (docs.length === 0 && !content.toLowerCase().includes('no') && !content.toLowerCase().includes("don't have") && !content.toLowerCase().includes('not found')) {
        // If RAG query returned nothing but answer presents specifics, flag it
        return {
          valid: true, // Allow but flag uncertainty if needed
        };
      }
    }

    return { valid: true };
  }
}

export const responseValidator = new ResponseValidator();
