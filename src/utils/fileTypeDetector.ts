import path from 'path';

export type FileCategory =
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'audio'
  | 'video'
  | 'code'
  | 'other';

export type FilePreviewType =
  | 'image'
  | 'pdf'
  | 'text'
  | 'code'
  | 'markdown'
  | 'csv'
  | 'spreadsheet'
  | 'docx'
  | 'pptx'
  | 'audio'
  | 'video'
  | 'archive'
  | 'unsupported';

export interface DetectedFileInfo {
  mimeType: string;
  detectedMimeType: string;
  extension: string;
  category: FileCategory;
  previewType: FilePreviewType;
  previewAvailable: boolean;
}

// Dangerous executable extensions that MUST be blocked for security
export const BLOCKED_EXECUTABLE_EXTENSIONS = new Set([
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
  '.apk',
  '.app',
  '.deb',
  '.rpm',
  '.sh.bin',
]);

export function isBlockedExecutable(filename: string): boolean {
  const ext = path.extname(filename || '').toLowerCase();
  return BLOCKED_EXECUTABLE_EXTENSIONS.has(ext);
}

// Known extension to MIME type map (comprehensive list covering user requirement)
const EXTENSION_MIME_MAP: Record<string, { mime: string; category: FileCategory; previewType: FilePreviewType }> = {
  // Images
  '.jpg': { mime: 'image/jpeg', category: 'image', previewType: 'image' },
  '.jpeg': { mime: 'image/jpeg', category: 'image', previewType: 'image' },
  '.png': { mime: 'image/png', category: 'image', previewType: 'image' },
  '.webp': { mime: 'image/webp', category: 'image', previewType: 'image' },
  '.gif': { mime: 'image/gif', category: 'image', previewType: 'image' },
  '.svg': { mime: 'image/svg+xml', category: 'image', previewType: 'image' },
  '.bmp': { mime: 'image/bmp', category: 'image', previewType: 'image' },
  '.tiff': { mime: 'image/tiff', category: 'image', previewType: 'image' },
  '.tif': { mime: 'image/tiff', category: 'image', previewType: 'image' },
  '.ico': { mime: 'image/x-icon', category: 'image', previewType: 'image' },
  '.avif': { mime: 'image/avif', category: 'image', previewType: 'image' },

  // Documents
  '.pdf': { mime: 'application/pdf', category: 'document', previewType: 'pdf' },
  '.doc': { mime: 'application/msword', category: 'document', previewType: 'docx' },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'document',
    previewType: 'docx',
  },
  '.txt': { mime: 'text/plain', category: 'document', previewType: 'text' },
  '.md': { mime: 'text/markdown', category: 'document', previewType: 'markdown' },
  '.markdown': { mime: 'text/markdown', category: 'document', previewType: 'markdown' },
  '.rtf': { mime: 'application/rtf', category: 'document', previewType: 'text' },
  '.odt': { mime: 'application/vnd.oasis.opendocument.text', category: 'document', previewType: 'docx' },

  // Data & Spreadsheets
  '.csv': { mime: 'text/csv', category: 'spreadsheet', previewType: 'csv' },
  '.tsv': { mime: 'text/tab-separated-values', category: 'spreadsheet', previewType: 'csv' },
  '.xls': { mime: 'application/vnd.ms-excel', category: 'spreadsheet', previewType: 'spreadsheet' },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'spreadsheet',
    previewType: 'spreadsheet',
  },
  '.ods': { mime: 'application/vnd.oasis.opendocument.spreadsheet', category: 'spreadsheet', previewType: 'spreadsheet' },
  '.json': { mime: 'application/json', category: 'code', previewType: 'code' },
  '.xml': { mime: 'application/xml', category: 'code', previewType: 'code' },
  '.yaml': { mime: 'application/x-yaml', category: 'code', previewType: 'code' },
  '.yml': { mime: 'application/x-yaml', category: 'code', previewType: 'code' },
  '.sql': { mime: 'application/sql', category: 'code', previewType: 'code' },
  '.log': { mime: 'text/plain', category: 'document', previewType: 'text' },

  // Presentations
  '.ppt': { mime: 'application/vnd.ms-powerpoint', category: 'presentation', previewType: 'pptx' },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    category: 'presentation',
    previewType: 'pptx',
  },
  '.odp': { mime: 'application/vnd.oasis.opendocument.presentation', category: 'presentation', previewType: 'pptx' },

  // Archives
  '.zip': { mime: 'application/zip', category: 'archive', previewType: 'archive' },
  '.rar': { mime: 'application/vnd.rar', category: 'archive', previewType: 'archive' },
  '.7z': { mime: 'application/x-7z-compressed', category: 'archive', previewType: 'archive' },
  '.tar': { mime: 'application/x-tar', category: 'archive', previewType: 'archive' },
  '.gz': { mime: 'application/gzip', category: 'archive', previewType: 'archive' },
  '.tgz': { mime: 'application/gzip', category: 'archive', previewType: 'archive' },

  // Media (Audio)
  '.mp3': { mime: 'audio/mpeg', category: 'audio', previewType: 'audio' },
  '.wav': { mime: 'audio/wav', category: 'audio', previewType: 'audio' },
  '.ogg': { mime: 'audio/ogg', category: 'audio', previewType: 'audio' },
  '.m4a': { mime: 'audio/x-m4a', category: 'audio', previewType: 'audio' },
  '.flac': { mime: 'audio/flac', category: 'audio', previewType: 'audio' },
  '.aac': { mime: 'audio/aac', category: 'audio', previewType: 'audio' },

  // Media (Video)
  '.mp4': { mime: 'video/mp4', category: 'video', previewType: 'video' },
  '.webm': { mime: 'video/webm', category: 'video', previewType: 'video' },
  '.mov': { mime: 'video/quicktime', category: 'video', previewType: 'video' },
  '.avi': { mime: 'video/x-msvideo', category: 'video', previewType: 'video' },
  '.mkv': { mime: 'video/x-matroska', category: 'video', previewType: 'video' },

  // Code
  '.js': { mime: 'application/javascript', category: 'code', previewType: 'code' },
  '.mjs': { mime: 'application/javascript', category: 'code', previewType: 'code' },
  '.cjs': { mime: 'application/javascript', category: 'code', previewType: 'code' },
  '.ts': { mime: 'application/typescript', category: 'code', previewType: 'code' },
  '.jsx': { mime: 'text/jsx', category: 'code', previewType: 'code' },
  '.tsx': { mime: 'text/tsx', category: 'code', previewType: 'code' },
  '.html': { mime: 'text/html', category: 'code', previewType: 'code' },
  '.htm': { mime: 'text/html', category: 'code', previewType: 'code' },
  '.css': { mime: 'text/css', category: 'code', previewType: 'code' },
  '.scss': { mime: 'text/x-scss', category: 'code', previewType: 'code' },
  '.sass': { mime: 'text/x-sass', category: 'code', previewType: 'code' },
  '.less': { mime: 'text/x-less', category: 'code', previewType: 'code' },
  '.java': { mime: 'text/x-java-source', category: 'code', previewType: 'code' },
  '.py': { mime: 'text/x-python', category: 'code', previewType: 'code' },
  '.c': { mime: 'text/x-c', category: 'code', previewType: 'code' },
  '.cpp': { mime: 'text/x-c++', category: 'code', previewType: 'code' },
  '.cc': { mime: 'text/x-c++', category: 'code', previewType: 'code' },
  '.h': { mime: 'text/x-c', category: 'code', previewType: 'code' },
  '.hpp': { mime: 'text/x-c++', category: 'code', previewType: 'code' },
  '.cs': { mime: 'text/x-csharp', category: 'code', previewType: 'code' },
  '.go': { mime: 'text/x-golang', category: 'code', previewType: 'code' },
  '.rs': { mime: 'text/rust', category: 'code', previewType: 'code' },
  '.php': { mime: 'application/x-httpd-php', category: 'code', previewType: 'code' },
  '.sh': { mime: 'application/x-sh', category: 'code', previewType: 'code' },
  '.bash': { mime: 'application/x-sh', category: 'code', previewType: 'code' },
  '.zsh': { mime: 'application/x-sh', category: 'code', previewType: 'code' },
  '.env': { mime: 'text/plain', category: 'code', previewType: 'code' },
  '.toml': { mime: 'application/toml', category: 'code', previewType: 'code' },
  '.ini': { mime: 'text/x-ini', category: 'code', previewType: 'code' },
  '.conf': { mime: 'text/plain', category: 'code', previewType: 'code' },
};

/**
 * Detect magic bytes from the first 64 bytes of buffer.
 */
function detectFromMagicBytes(buf: Buffer, ext: string): string | null {
  if (!buf || buf.length < 2) return null;

  // 1. PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // 3. JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // 4. GIF: GIF87a or GIF89a (47 49 46 38)
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return 'image/gif';
  }

  // 5. RIFF containers: WEBP, WAV, AVI
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    const subType = buf.slice(8, 12).toString('ascii');
    if (subType === 'WEBP') return 'image/webp';
    if (subType === 'WAVE') return 'audio/wav';
    if (subType === 'AVI ') return 'video/x-msvideo';
  }

  // 6. BMP: BM (0x42, 0x4D)
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) {
    return 'image/bmp';
  }

  // 7. TIFF: II*. (0x49 0x49 0x2A 0x00) or MM.* (0x4D 0x4D 0x00 0x2A)
  if (buf.length >= 4) {
    if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
        (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) {
      return 'image/tiff';
    }
  }

  // 8. ICO: 00 00 01 00
  if (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) {
    return 'image/x-icon';
  }

  // 9. ZIP / OOXML containers: PK\x03\x04 or PK\x05\x06
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05)) {
    if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (ext === '.odt') return 'application/vnd.oasis.opendocument.text';
    if (ext === '.ods') return 'application/vnd.oasis.opendocument.spreadsheet';
    if (ext === '.odp') return 'application/vnd.oasis.opendocument.presentation';
    return 'application/zip';
  }

  // 10. GZIP: 1F 8B
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return 'application/gzip';
  }

  // 11. 7-Zip: 37 7A BC AF 27 1C
  if (buf.length >= 6 &&
      buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc &&
      buf[3] === 0xaf && buf[4] === 0x27 && buf[5] === 0x1c) {
    return 'application/x-7z-compressed';
  }

  // 12. RAR: 52 61 72 21 (Rar!)
  if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) {
    return 'application/vnd.rar';
  }

  // 13. MP3: ID3 or FF FB / FF F3 / FF F2
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    return 'audio/mpeg';
  }
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }

  // 14. OGG: OggS (4F 67 67 53)
  if (buf.length >= 4 && buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return ext === '.ogv' ? 'video/ogg' : 'audio/ogg';
  }

  // 15. FLAC: fLaC (66 4C 61 43)
  if (buf.length >= 4 && buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) {
    return 'audio/flac';
  }

  // 16. MP4 / MOV: ftyp box at offset 4
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (brand.includes('qt') || ext === '.mov') return 'video/quicktime';
    if (brand.includes('avif')) return 'image/avif';
    return 'video/mp4';
  }

  // 17. Matroska / WebM: 1A 45 DF A3
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return ext === '.mkv' ? 'video/x-matroska' : 'video/webm';
  }

  // 18. TAR: ustar at offset 257
  if (buf.length >= 262 && buf.slice(257, 262).toString('ascii') === 'ustar') {
    return 'application/x-tar';
  }

  // 19. Text-based detection: SVG, XML, HTML, JSON
  const sample = buf.slice(0, Math.min(buf.length, 512)).toString('utf-8').trim();
  if (sample.includes('<svg') && (sample.includes('xmlns=') || sample.startsWith('<svg'))) {
    return 'image/svg+xml';
  }
  if (sample.startsWith('<!DOCTYPE html') || sample.startsWith('<html')) {
    return 'text/html';
  }
  if (sample.startsWith('<?xml')) {
    return 'application/xml';
  }

  return null;
}

/**
 * Universal file type & capability detector.
 * Combines Magic bytes, Extension mapping, and Client hints.
 */
export function detectFileType(
  buffer: Buffer | null,
  filename: string,
  clientMimeType?: string,
): DetectedFileInfo {
  const cleanName = filename || 'untitled';
  const ext = path.extname(cleanName).toLowerCase();

  // 1. Magic bytes detection
  let detectedMime: string | null = null;
  if (buffer && buffer.length > 0) {
    detectedMime = detectFromMagicBytes(buffer, ext);
  }

  // 2. Extension map lookup
  const extInfo = EXTENSION_MIME_MAP[ext];

  // 3. Resolve effective MIME type
  let effectiveMime = detectedMime;
  if (!effectiveMime) {
    if (extInfo) {
      effectiveMime = extInfo.mime;
    } else if (clientMimeType && clientMimeType !== 'application/octet-stream') {
      effectiveMime = clientMimeType.toLowerCase();
    } else {
      effectiveMime = 'application/octet-stream';
    }
  }

  // 4. Derive category & preview type
  let category: FileCategory = 'other';
  let previewType: FilePreviewType = 'unsupported';

  if (extInfo) {
    category = extInfo.category;
    previewType = extInfo.previewType;
  } else if (effectiveMime.startsWith('image/')) {
    category = 'image';
    previewType = 'image';
  } else if (effectiveMime === 'application/pdf') {
    category = 'document';
    previewType = 'pdf';
  } else if (effectiveMime.startsWith('audio/')) {
    category = 'audio';
    previewType = 'audio';
  } else if (effectiveMime.startsWith('video/')) {
    category = 'video';
    previewType = 'video';
  } else if (
    effectiveMime === 'text/markdown' ||
    effectiveMime === 'text/x-markdown'
  ) {
    category = 'document';
    previewType = 'markdown';
  } else if (
    effectiveMime === 'text/csv' ||
    effectiveMime === 'text/tab-separated-values'
  ) {
    category = 'spreadsheet';
    previewType = 'csv';
  } else if (
    effectiveMime.startsWith('text/') ||
    effectiveMime.includes('javascript') ||
    effectiveMime.includes('typescript') ||
    effectiveMime.includes('json') ||
    effectiveMime.includes('xml') ||
    effectiveMime.includes('yaml') ||
    effectiveMime.includes('sql')
  ) {
    category = 'code';
    previewType = 'code';
  } else if (
    effectiveMime.includes('zip') ||
    effectiveMime.includes('compressed') ||
    effectiveMime.includes('tar') ||
    effectiveMime.includes('gzip')
  ) {
    category = 'archive';
    previewType = 'archive';
  }

  const previewAvailable = previewType !== 'unsupported';

  return {
    mimeType: effectiveMime,
    detectedMimeType: detectedMime || effectiveMime,
    extension: ext,
    category,
    previewType,
    previewAvailable,
  };
}
