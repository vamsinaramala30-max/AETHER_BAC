import { logger } from '../../config';

export class UploadService {
  public async handleSingleUpload(file: Express.Multer.File): Promise<{ url: string; originalName: string; size: number }> {
    logger.info(`Processing file upload: ${file.originalname}`);
    // Simulated upload processing logic leading to static mock asset target URL
    const fileUrl = `https://storage.aether.internal/uploads/${Date.now()}_${file.originalname}`;
    return {
      url: fileUrl,
      originalName: file.originalname,
      size: file.size,
    };
  }

  public async handleMultipleUploads(files: Express.Multer.File[]) {
    return Promise.all(files.map((file) => this.handleSingleUpload(file)));
  }
}