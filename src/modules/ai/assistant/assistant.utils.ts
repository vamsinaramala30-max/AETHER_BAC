import { ASSISTANT_CONSTANTS } from './assistant.constants';
import { AttachmentMetadata } from './assistant.types';

export class AssistantUtils {
  static estimateTokenCount(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / ASSISTANT_CONSTANTS.CONTEXT.CHARS_PER_TOKEN_ESTIMATE);
  }

  static formatAttachmentContext(attachments: AttachmentMetadata[]): string {
    if (!attachments || attachments.length === 0) return '';

    const formatted = attachments
      .map((att) => `[Attachment: ${att.filename} (${att.mimeType}, ${att.sizeBytes} bytes)]`)
      .join('\n');

    return `\n\nAttachments:\n${formatted}`;
  }

  static generateTitleFromContent(content: string): string {
    const cleaned = content.trim().replace(/[\r\n]+/g, ' ');
    if (cleaned.length <= 40) return cleaned;
    return cleaned.slice(0, 37) + '...';
  }

  static sanitizeMetadata(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}