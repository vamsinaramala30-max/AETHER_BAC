import { PrismaClient } from '@prisma/client';
import { UploadService } from '../../../upload/upload.service';
import { logger } from '../../../../config';

export class FilesAdapter {
  private uploadService: UploadService;

  constructor(private prisma: PrismaClient) {
    this.uploadService = new UploadService();
  }

  public async organizeFile(fileId: string, folderId: string) {
    logger.info(`[FilesAdapter] Moving file '${fileId}' to folder '${folderId}'`);
    return this.prisma.file.update({
      where: { id: fileId },
      data: { folderId },
    });
  }

  public async renameFile(fileId: string, newName: string) {
    logger.info(`[FilesAdapter] Renaming file '${fileId}' to '${newName}'`);
    return this.prisma.file.update({
      where: { id: fileId },
      data: { filename: newName },
    });
  }

  public async getFileDetails(fileId: string) {
    return this.uploadService.getFileById(fileId);
  }
}
