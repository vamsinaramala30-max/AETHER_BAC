import path from 'path';

export interface FileValidationOptions {
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

export class FileValidator {
  private static readonly DEFAULT_MAX_SIZE = 25 * 1024 * 1024; // 25 MB
  private static readonly DEFAULT_ALLOWED_MIMES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
  ];

  /**
   * Validates file size, MIME type, and extension against strict rules.
   */
  public static validate(
    file: { originalname: string; mimetype: string; size: number },
    options: FileValidationOptions = {}
  ): { valid: boolean; error?: string } {
    const maxSize = options.maxSizeBytes || FileValidator.DEFAULT_MAX_SIZE;
    const allowedMimes = options.allowedMimeTypes || FileValidator.DEFAULT_ALLOWED_MIMES;

    if (file.size > maxSize) {
      const maxMb = (maxSize / (1024 * 1024)).toFixed(1);
      return { valid: false, error: `File size exceeds the allowable limit of ${maxMb} MB.` };
    }

    if (!allowedMimes.includes(file.mimetype)) {
      return { valid: false, error: `MIME type '${file.mimetype}' is not permitted.` };
    }

    if (options.allowedExtensions && options.allowedExtensions.length > 0) {
      const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
      if (!options.allowedExtensions.includes(ext)) {
        return { valid: false, error: `File extension '.${ext}' is not permitted.` };
      }
    }

    return { valid: true };
  }
}