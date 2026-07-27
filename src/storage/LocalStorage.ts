import fs from 'fs/promises';
import path from 'path';
import { appConfig, logger } from '../config';

export class LocalStorage {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), 'uploads');
    this.ensureBaseDirectory();
  }

  private async ensureBaseDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create local upload directory:', error);
    }
  }

  public async upload(
    fileBuffer: Buffer,
    filePath: string,
    bucket: string = 'default',
  ): Promise<{ path: string; url: string }> {
    const targetDir = path.join(this.baseDir, bucket, path.dirname(filePath));
    const fullPath = path.join(this.baseDir, bucket, filePath);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(fullPath, fileBuffer);

    const relativePath = path.join(bucket, filePath).replace(/\\/g, '/');
    const url = `${appConfig.url}/uploads/${relativePath}`;

    return { path: relativePath, url };
  }

  public async delete(filePath: string, bucket: string = 'default'): Promise<void> {
    const fullPath = path.join(this.baseDir, bucket, filePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      logger.warn(
        `LocalStorage file deletion failed or file not found at path ${fullPath}:`,
        error,
      );
    }
  }

  public async getBuffer(filePath: string, bucket: string = 'default'): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, bucket, filePath);
    return fs.readFile(fullPath);
  }
}
