import { PrismaClient } from '@prisma/client';

export class AttachmentService {
  constructor(private prisma: PrismaClient) {}

  async attachFile(
    eventId: string,
    fileData: { fileName: string; fileUrl: string; fileSize: number; mimeType: string },
  ) {
    return (this.prisma as any).eventAttachment.create({
      data: { eventId, ...fileData },
    });
  }
}
