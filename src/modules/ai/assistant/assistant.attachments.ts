import { AttachmentMetadata } from './assistant.types';

export class AssistantAttachmentsHandler {
  public static processAttachments(attachments?: AttachmentMetadata[]): AttachmentMetadata[] {
    if (!attachments || attachments.length === 0) return [];

    return attachments.map((att) => ({
      id: att.id || crypto.randomUUID(),
      filename: att.filename,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      url: att.url,
      checksum: att.checksum,
      uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date(),
    }));
  }

  public static extractTextRepresentation(attachments: AttachmentMetadata[]): string {
    if (!attachments || attachments.length === 0) return '';
    return attachments.map((att) => `[File: ${att.filename} (${att.mimeType})]`).join('\n');
  }
}