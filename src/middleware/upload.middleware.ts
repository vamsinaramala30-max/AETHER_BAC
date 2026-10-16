import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import path from 'path';
import { env } from '../config';
import { isBlockedExecutable } from '../utils/fileTypeDetector';

const storage = multer.memoryStorage();

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Always block dangerous executable binaries
  if (isBlockedExecutable(file.originalname || '')) {
    return cb(new Error(`File extension '${ext}' is prohibited for security reasons.`));
  }

  // Universal acceptance for all non-executable data, documents, media, code, archives, and custom files
  cb(null, true);
};

const maxSizeBytes = env.UPLOAD_MAX_SIZE_MB * 1024 * 1024;

export { fileFilter };

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSizeBytes,
    files: 10, // Hardened batch limit: prevents concurrent heap spikes from memoryStorage
  },
});

