import path from 'path';
import crypto from 'crypto';
import { StorageService } from './StorageService';

export class FileManager {
  private storageService: StorageService;

  constructor() {
    this.storageService = new StorageService();
  }

  /**
   * Generates a collision-resistant unique file path based on workspace context.
   */
  public generateUniquePath(workspaceId: string, originalName: string): string {
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    const sanitizedBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '_');

    return `${workspaceId}/${timestamp}_${hash}_${sanitizedBase}${ext}`;
  }

  public async storeFile(
    workspaceId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    bucket?: string
  ) {
    const key = this.generateUniquePath(workspaceId, file.originalname);
    const uploadResult = await this.storageService.upload(file.buffer, key, file.mimetype, bucket);

    return {
      key: uploadResult.path,
      url: uploadResult.url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.buffer.length,
      driver: uploadResult.driver,
    };
  }

  public async removeFile(key: string, bucket?: string): Promise<void> {
    await this.storageService.delete(key, bucket);
  }
}