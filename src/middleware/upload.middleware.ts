import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import path from 'path';
import { env } from '../config';

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/x-ms-bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  // Documents & Markup
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  // Spreadsheets
  'text/csv',
  'text/tab-separated-values',
  'text/tsv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  // Presentations
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation',
  // Code & Structured Data
  'application/json',
  'application/xml',
  'text/xml',
  'application/x-yaml',
  'text/yaml',
  'text/x-yaml',
  'application/javascript',
  'text/javascript',
  'application/x-javascript',
  'application/typescript',
  'text/typescript',
  'text/css',
  'text/x-python',
  'application/x-python-code',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++',
  'text/x-csharp',
  'text/x-go',
  'text/x-rust',
  'application/x-httpd-php',
  'text/x-php',
  'application/sql',
  'text/x-sql',
  'application/x-sh',
  'text/x-shellscript',
  'application/toml',
  'text/x-toml',
  'text/x-ini',
  // Audio
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  // Video
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-7z-compressed',
]);

const blockedExtensions = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.vbs',
  '.wsf',
  '.pif',
]);

const allowedSafeExtensions = new Set([
  // Documents & Spreadsheets & Presentations
  '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.md', '.markdown', '.html', '.htm',
  '.xls', '.xlsx', '.csv', '.tsv', '.ods',
  '.ppt', '.pptx', '.odp',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico',
  // Code
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.go', '.rs', '.php', '.css', '.sql', '.json', '.yaml', '.yml',
  '.xml', '.sh', '.bash', '.env', '.log', '.toml', '.ini', '.conf',
  // Audio & Video
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  // Archives
  '.zip', '.tar', '.gz', '.7z',
]);

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname || '').toLowerCase();

  // Always block dangerous executable binaries
  if (blockedExtensions.has(ext)) {
    return cb(new Error(`File extension '${ext}' is prohibited for security reasons.`));
  }

  // Allow known safe MIME types
  if (allowedMimeTypes.has(file.mimetype.toLowerCase())) {
    return cb(null, true);
  }

  // Allow safe files sent with generic application/octet-stream or text/* by browser
  if (
    (file.mimetype === 'application/octet-stream' || file.mimetype.startsWith('text/')) &&
    allowedSafeExtensions.has(ext)
  ) {
    return cb(null, true);
  }

  cb(new Error(`File type '${file.mimetype}' is not supported.`));
};

const maxSizeBytes = env.UPLOAD_MAX_SIZE_MB * 1024 * 1024;

export { fileFilter };

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSizeBytes,
    files: 5,
  },
});
