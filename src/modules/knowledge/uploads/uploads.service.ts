import { UploadsRepository } from './uploads.repository';
import { PrepareUploadDto } from './uploads.dto';
import { KNOWLEDGE_CONSTANTS } from '../knowledge.constants';

export class UploadsService {
  constructor(private readonly uploadsRepository: UploadsRepository) {}

  async prepareUpload(dto: PrepareUploadDto, userId: string) {
    if (dto.sizeBytes > KNOWLEDGE_CONSTANTS.UPLOADS.MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds maximum permitted limit.`);
    }

    if (!KNOWLEDGE_CONSTANTS.UPLOADS.ALLOWED_MIME_TYPES.includes(dto.mimeType as any)) {
      throw new Error(`Unsupported file type: ${dto.mimeType}`);
    }

    const fileKey = `uploads/${userId}/${Date.now()}_${dto.filename}`;
    const uploadRecord = await this.uploadsRepository.save({
      originalName: dto.filename,
      fileKey,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      storageProvider: 'S3_COMPATIBLE',
      uploaderId: userId,
    });

    return {
      uploadRecord,
      uploadUrl: `https://storage.local/upload-presigned-url/${fileKey}`,
    };
  }
}