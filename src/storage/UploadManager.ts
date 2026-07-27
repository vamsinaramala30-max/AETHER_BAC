import { FileValidator, FileValidationOptions } from './FileValidator';
import { ImageProcessor, ImageProcessingOptions } from './ImageProcessor';
import { FileManager } from './FileManager';

export interface FileUploadPayload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export class UploadManager {
  private fileManager: FileManager;

  constructor() {
    this.fileManager = new FileManager();
  }

  public async processAndUpload(
    workspaceId: string,
    file: FileUploadPayload,
    validationOpts?: FileValidationOptions,
    imageOpts?: ImageProcessingOptions,
  ) {
    const validation = FileValidator.validate(file, validationOpts);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file payload.');
    }

    let bufferToUpload = file.buffer;
    let mimeTypeToUpload = file.mimetype;

    if (file.mimetype.startsWith('image/')) {
      const processed = await ImageProcessor.processBuffer(file.buffer, imageOpts);
      bufferToUpload = processed.buffer;
      mimeTypeToUpload = processed.mimetype;
    }

    return this.fileManager.storeFile(workspaceId, {
      buffer: bufferToUpload,
      originalname: file.originalname,
      mimetype: mimeTypeToUpload,
    });
  }
}
