import { ASSISTANT_CONSTANTS } from './assistant.constants';
import { AttachmentMetadata, MessageRole } from './assistant.types';

export class AssistantValidator {
  static validatePagination(page?: unknown, limit?: unknown): { page: number; limit: number } {
    const parsedPage = Math.max(
      1,
      parseInt(String(page || ASSISTANT_CONSTANTS.PAGINATION.DEFAULT_PAGE), 10),
    );
    const parsedLimit = Math.min(
      ASSISTANT_CONSTANTS.PAGINATION.MAX_LIMIT,
      Math.max(1, parseInt(String(limit || ASSISTANT_CONSTANTS.PAGINATION.DEFAULT_LIMIT), 10)),
    );

    return { page: parsedPage, limit: parsedLimit };
  }

  static validateCreateConversation(body: any): void {
    if (body.title && typeof body.title !== 'string') {
      throw new Error('Title must be a string');
    }
    if (body.initialMessage) {
      if (!body.initialMessage.content || typeof body.initialMessage.content !== 'string') {
        throw new Error('Initial message content is required and must be a string');
      }
    }
  }

  static validateSendMessage(body: any): void {
    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      throw new Error('Message content is required and cannot be empty');
    }
    if (body.role && !Object.values(MessageRole).includes(body.role)) {
      throw new Error(`Invalid role provided. Allowed: ${Object.values(MessageRole).join(', ')}`);
    }
    if (body.attachments) {
      this.validateAttachments(body.attachments);
    }
  }

  static validateAttachments(attachments: unknown): void {
    if (!Array.isArray(attachments)) {
      throw new Error('Attachments must be an array');
    }
    for (const att of attachments) {
      if (!att.filename || !att.mimeType || !att.url) {
        throw new Error('Invalid attachment payload structure');
      }
    }
  }

  static validateSearch(query: unknown): string {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Search query must be a non-empty string');
    }
    return query.trim();
  }
}
