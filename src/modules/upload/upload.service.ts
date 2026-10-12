import { FileStatus } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { logger, env } from '../../config';
import { db } from '../../database/client';
import { AppError } from '../../middleware/error.middleware';
import { StorageService } from '../../storage/StorageService';
import { documentParser, parseZipEntries } from '../ai/rag/ingestion/document-parser';
import { detectFileType, isBlockedExecutable } from '../../utils/fileTypeDetector';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const VERSIONS_DIR = path.join(UPLOAD_DIR, 'versions');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(VERSIONS_DIR)) {
  fs.mkdirSync(VERSIONS_DIR, { recursive: true });
}

function inferFileType(mimeType: string, filename: string): 'document' | 'spreadsheet' | 'code' | 'model' | 'diagram' {
  const m = (mimeType || '').toLowerCase();
  const ext = path.extname(filename || '').toLowerCase();
  if (
    m.includes('spreadsheet') ||
    m.includes('excel') ||
    ['.xlsx', '.xls', '.csv', '.tsv'].includes(ext)
  ) {
    return 'spreadsheet';
  }
  if (
    m.includes('javascript') ||
    m.includes('typescript') ||
    m.includes('json') ||
    m.includes('xml') ||
    ['.js', '.ts', '.tsx', '.jsx', '.py', '.sh', '.html', '.css', '.yaml', '.yml', '.sql', '.env'].includes(ext)
  ) {
    return 'code';
  }
  if (['.onnx', '.pt', '.pth', '.bin', '.safetensors', '.h5'].includes(ext)) {
    return 'model';
  }
  if (['.drawio', '.svg', '.fig'].includes(ext)) {
    return 'diagram';
  }
  return 'document';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const isValidUuid = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

function toSafeIsoString(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val.toISOString === 'function') return val.toISOString();
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function parseTrashMarker(desc: string | null | undefined): { trashedAt: string | null; originalFolderId: string | null } {
  if (!desc || !desc.startsWith('__TRASH__')) {
    return { trashedAt: null, originalFolderId: null };
  }
  if (desc.includes('::')) {
    const parts = desc.split('::');
    return {
      trashedAt: parts[1] || null,
      originalFolderId: parts[2] && parts[2] !== 'root' ? parts[2] : null,
    };
  }
  const parts = desc.split(':');
  if (parts.length >= 3) {
    const folder = parts[parts.length - 1];
    const timestamp = parts.slice(1, parts.length - 1).join(':');
    return {
      trashedAt: timestamp,
      originalFolderId: folder !== 'root' ? folder : null,
    };
  }
  return { trashedAt: parts[1] || null, originalFolderId: null };
}

export class UploadService {
  private storageService: StorageService;

  constructor() {
    this.storageService = new StorageService();
  }

  public async getUserStorageUsage(userId: string) {
    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    const quotaEnv = process.env.STORAGE_QUOTA_BYTES;
    const quotaBytes =
      quotaEnv && !isNaN(parseInt(quotaEnv, 10))
        ? parseInt(quotaEnv, 10)
        : 128 * 1024 * 1024 * 1024; // 128 GB default target

    let userFiles: Array<{ id: string; size: number; description: string | null; isTrash?: boolean }> = [];
    try {
      if (db && db.file && typeof db.file.findMany === 'function') {
        userFiles = await db.file.findMany({
          where: {
            userId,
          },
          select: {
            id: true,
            size: true,
            description: true,
            isTrash: true,
          },
        });
      }
    } catch (err) {
      logger.warn('Failed querying user files for storage calculation:', err);
      userFiles = [];
    }

    let activeBytes = 0;
    let trashBytes = 0;

    for (const f of userFiles) {
      if (f.isTrash || (f.description && f.description.startsWith('__TRASH__'))) {
        trashBytes += f.size;
      } else {
        activeBytes += f.size;
      }
    }

    const usedBytes = activeBytes + trashBytes;
    const availableBytes = Math.max(0, quotaBytes - usedBytes);
    const usagePercentage =
      quotaBytes > 0 ? parseFloat(((usedBytes / quotaBytes) * 100).toFixed(2)) : 0;

    return {
      quotaBytes,
      quotaBytesStr: formatBytes(quotaBytes),
      usedBytes,
      usedBytesStr: formatBytes(usedBytes),
      activeBytes,
      activeBytesStr: formatBytes(activeBytes),
      trashBytes,
      trashBytesStr: formatBytes(trashBytes),
      availableBytes,
      availableBytesStr: formatBytes(availableBytes),
      usagePercentage,
    };
  }

  public async resolveUniqueFilename(
    userId: string,
    folderId: string | null,
    originalName: string,
  ): Promise<string> {
    const ext = path.extname(originalName);
    const stem = path.basename(originalName, ext);

    let existingFiles: Array<{ filename: string }> = [];
    try {
      if (db && db.file && typeof db.file.findMany === 'function') {
        existingFiles = await db.file.findMany({
          where: {
            userId,
            folderId: folderId || null,
            isTrash: false,
            OR: [
              { description: null },
              { NOT: { description: { startsWith: '__TRASH__' } } },
            ],
            filename: {
              startsWith: stem,
            },
          },
          select: { filename: true },
        });
      }
    } catch {
      existingFiles = [];
    }

    const existingNames = new Set(existingFiles.map((f) => f.filename.toLowerCase()));
    if (!existingNames.has(originalName.toLowerCase())) {
      return originalName;
    }

    let counter = 1;
    let candidate = `${stem} (${counter})${ext}`;
    while (existingNames.has(candidate.toLowerCase())) {
      counter++;
      candidate = `${stem} (${counter})${ext}`;
    }
    return candidate;
  }

  public async handleSingleUpload(
    file: Express.Multer.File,
    userId?: string,
    workspaceId?: string | null,
    projectId?: string | null,
    folderId?: string | null,
  ): Promise<any> {
    logger.info(`Processing file upload: ${file.originalname}`);

    if (!file || file.size === 0 || (!file.buffer && !file.path) || (file.buffer && file.buffer.length === 0)) {
      throw new AppError('Cannot upload empty or invalid file', 400, 'EMPTY_FILE');
    }

    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required for upload', 401, 'UNAUTHORIZED');
    }

    let cleanWorkspaceId =
      workspaceId && typeof workspaceId === 'string' && workspaceId.trim() !== ''
        ? workspaceId.trim()
        : null;

    if (cleanWorkspaceId) {
      if (!isValidUuid(cleanWorkspaceId)) {
        throw new AppError('Invalid workspace ID format', 400, 'INVALID_WORKSPACE_ID');
      }
      const membership = await db.workspaceMember.findFirst({
        where: { workspaceId: cleanWorkspaceId, userId },
      });
      if (!membership) {
        throw new AppError('Forbidden: you are not a member of this workspace', 403, 'FORBIDDEN');
      }
    }

    const cleanProjectId =
      projectId && typeof projectId === 'string' && projectId.trim() !== ''
        ? projectId.trim()
        : null;

    if (cleanProjectId) {
      if (!isValidUuid(cleanProjectId)) {
        throw new AppError('Invalid project ID format', 400, 'INVALID_PROJECT_ID');
      }
      const project = await db.project.findUnique({
        where: { id: cleanProjectId },
      });
      if (!project) {
        throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
      }
      if (cleanWorkspaceId && project.workspaceId !== cleanWorkspaceId) {
        throw new AppError('Project does not belong to specified workspace', 400, 'PROJECT_WORKSPACE_MISMATCH');
      }
      if (!cleanWorkspaceId) {
        cleanWorkspaceId = project.workspaceId;
      }
      const isProjectOwner = project.ownerId === userId;
      const isProjectWsMember = await db.workspaceMember.findFirst({
        where: { workspaceId: project.workspaceId, userId },
      });
      if (!isProjectOwner && !isProjectWsMember) {
        throw new AppError('Forbidden: you do not have access to this project', 403, 'FORBIDDEN');
      }
    }

    const cleanFolderId =
      folderId && typeof folderId === 'string' && folderId.trim() !== '' && folderId.trim() !== 'root'
        ? folderId.trim()
        : null;
    if (cleanFolderId && !isValidUuid(cleanFolderId)) {
      throw new AppError('Invalid folder ID format', 400, 'INVALID_FOLDER_ID');
    }

    // Sanitize filename and prevent directory traversal
    const rawName = file.originalname || 'upload';
    const sanitizedOriginal = path.basename(rawName).replace(/[\0\r\n\t]/g, '').trim() || 'upload';
    if (sanitizedOriginal === '.' || sanitizedOriginal === '..' || sanitizedOriginal.includes('/') || sanitizedOriginal.includes('\\')) {
      throw new AppError('Invalid filename or path traversal detected', 400, 'INVALID_FILENAME');
    }

    // Security: Block dangerous executable binaries
    if (isBlockedExecutable(sanitizedOriginal)) {
      throw new AppError(`File extension '${path.extname(sanitizedOriginal)}' is prohibited for security reasons.`, 400, 'SECURITY_VIOLATION');
    }

    // Storage Quota Enforcement (128 GB default target, configurable via STORAGE_QUOTA_BYTES)
    const storageUsage = await this.getUserStorageUsage(userId);
    if (storageUsage.usedBytes + file.size > storageUsage.quotaBytes) {
      throw new AppError(
        `Not enough storage. You have ${formatBytes(storageUsage.availableBytes)} available, but file requires ${formatBytes(file.size)}.`,
        400,
        'STORAGE_QUOTA_EXCEEDED',
      );
    }

    const uniqueFilename = await this.resolveUniqueFilename(userId, cleanFolderId, sanitizedOriginal);

    // Server-side type detection: Never blindly trust client mimeType/extension
    const fileBuf = file.buffer || (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
    const detected = detectFileType(fileBuf, sanitizedOriginal, file.mimetype);

    const safeExt = detected.extension || (path.extname(sanitizedOriginal) ? path.extname(sanitizedOriginal).replace(/[^a-z0-9.]/gi, '').toLowerCase() : '');
    const fileNameOnDisk = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`;
    const storagePath = path.resolve(UPLOAD_DIR, fileNameOnDisk);

    if (!storagePath.startsWith(path.resolve(UPLOAD_DIR))) {
      throw new AppError('Invalid file storage path', 400, 'INVALID_PATH');
    }

    try {
      if (file.buffer) {
        fs.writeFileSync(storagePath, file.buffer);
      } else if (file.path && fs.existsSync(file.path)) {
        fs.copyFileSync(file.path, storagePath);
      }
    } catch (fsErr) {
      logger.error('Failed writing file to disk:', fsErr);
      throw new AppError('Failed to store uploaded file', 500, 'FILE_STORAGE_ERROR');
    }

    // Persist via StorageService driver when configured (e.g. Supabase persistent cloud storage)
    try {
      if (env.STORAGE_DRIVER === 'supabase') {
        const buffer =
          file.buffer ||
          (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
        if (buffer) {
          const cloudKey = `${userId}/${cleanWorkspaceId || 'global'}/${fileNameOnDisk}`;
          await this.storageService.upload(
            buffer,
            cloudKey,
            detected.mimeType,
          );
        }
      }
    } catch (cloudErr) {
      logger.warn('StorageService cloud upload failed; local copy remains active:', cloudErr);
    }

    try {
      const savedFile = await db.file.create({
        data: {
          filename: uniqueFilename,
          mimeType: detected.mimeType,
          size: file.size,
          storagePath: fileNameOnDisk,
          status: FileStatus.READY,
          userId,
          workspaceId: cleanWorkspaceId,
          projectId: cleanProjectId,
          folderId: cleanFolderId,
        },
      });
      return {
        ...savedFile,
        originalName: sanitizedOriginal,
        detectedMimeType: detected.detectedMimeType,
        extension: detected.extension,
        category: detected.category,
        previewType: detected.previewType,
        previewAvailable: detected.previewAvailable,
        sizeStr: formatBytes(savedFile.size),
        createdAt: toSafeIsoString(savedFile.createdAt),
        uploadedAt: toSafeIsoString(savedFile.createdAt),
        updatedAt: toSafeIsoString(savedFile.updatedAt),
      };
    } catch (dbErr) {
      logger.error('Failed to create file record in DB:', dbErr);
      if (fs.existsSync(storagePath)) {
        try {
          fs.unlinkSync(storagePath);
        } catch {}
      }
      throw new AppError('Database error creating file record', 500, 'FILE_DB_ERROR');
    }
  }

  public async handleMultipleUploads(
    files: Express.Multer.File[],
    userId?: string,
    workspaceId?: string | null,
    projectId?: string | null,
    folderId?: string | null,
  ) {
    const cleanWorkspaceId =
      workspaceId && typeof workspaceId === 'string' && workspaceId.trim() !== ''
        ? workspaceId.trim()
        : null;
    const cleanProjectId =
      projectId && typeof projectId === 'string' && projectId.trim() !== ''
        ? projectId.trim()
        : null;
    return Promise.all(
      files.map((file) => this.handleSingleUpload(file, userId, cleanWorkspaceId, cleanProjectId, folderId)),
    );
  }

  public async listFiles(query: {
    search?: string;
    page?: number;
    limit?: number;
    userId?: string;
    workspaceId?: string;
    projectId?: string;
    hasProject?: boolean;
    folderId?: string | null;
    category?: string;
    favoriteOnly?: boolean;
    includeTrash?: boolean;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 20);
    const skip = (page - 1) * limit;

    if (!query.userId || !isValidUuid(query.userId)) {
      return {
        files: [],
        pagination: { total: 0, page: 1, limit, totalPages: 0 },
      };
    }

    const where: any = {};
    if (query.search) {
      where.filename = { contains: query.search, mode: 'insensitive' };
    }

    // Trash handling
    if (query.includeTrash) {
      where.OR = [
        { isTrash: true },
        { description: { startsWith: '__TRASH__' } },
      ];
    } else {
      where.AND = [
        { isTrash: false },
        {
          OR: [
            { description: null },
            { NOT: { description: { startsWith: '__TRASH__' } } },
          ],
        },
      ];
    }

    // Folder filtering
    if (query.folderId !== undefined) {
      if (query.folderId === 'root' || query.folderId === null) {
        where.folderId = null;
      } else if (query.folderId && isValidUuid(query.folderId)) {
        where.folderId = query.folderId;
      }
    }

    // Category filtering
    if (query.category && query.category !== 'All Files' && query.category !== 'All') {
      const cat = query.category.toLowerCase();
      if (cat === 'images' || cat === 'image') {
        where.OR = [
          { mimeType: { startsWith: 'image/' } },
          { filename: { endsWith: '.png', mode: 'insensitive' } },
          { filename: { endsWith: '.jpg', mode: 'insensitive' } },
          { filename: { endsWith: '.jpeg', mode: 'insensitive' } },
          { filename: { endsWith: '.webp', mode: 'insensitive' } },
          { filename: { endsWith: '.svg', mode: 'insensitive' } },
          { filename: { endsWith: '.gif', mode: 'insensitive' } },
          { filename: { endsWith: '.bmp', mode: 'insensitive' } },
          { filename: { endsWith: '.ico', mode: 'insensitive' } },
          { filename: { endsWith: '.tiff', mode: 'insensitive' } },
          { filename: { endsWith: '.avif', mode: 'insensitive' } },
        ];
      } else if (cat === 'pdfs' || cat === 'pdf') {
        where.OR = [
          { mimeType: 'application/pdf' },
          { filename: { endsWith: '.pdf', mode: 'insensitive' } },
        ];
      } else if (cat === 'spreadsheets' || cat === 'spreadsheet' || cat === 'data') {
        where.OR = [
          { mimeType: { in: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'text/tab-separated-values'] } },
          { filename: { endsWith: '.xlsx', mode: 'insensitive' } },
          { filename: { endsWith: '.xls', mode: 'insensitive' } },
          { filename: { endsWith: '.csv', mode: 'insensitive' } },
          { filename: { endsWith: '.tsv', mode: 'insensitive' } },
          { filename: { endsWith: '.ods', mode: 'insensitive' } },
        ];
      } else if (cat === 'presentations' || cat === 'presentation') {
        where.OR = [
          { mimeType: { in: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.presentation'] } },
          { filename: { endsWith: '.pptx', mode: 'insensitive' } },
          { filename: { endsWith: '.ppt', mode: 'insensitive' } },
          { filename: { endsWith: '.odp', mode: 'insensitive' } },
        ];
      } else if (cat === 'documents' || cat === 'document') {
        where.OR = [
          { mimeType: { in: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'application/rtf', 'application/vnd.oasis.opendocument.text'] } },
          { filename: { endsWith: '.docx', mode: 'insensitive' } },
          { filename: { endsWith: '.doc', mode: 'insensitive' } },
          { filename: { endsWith: '.txt', mode: 'insensitive' } },
          { filename: { endsWith: '.md', mode: 'insensitive' } },
          { filename: { endsWith: '.rtf', mode: 'insensitive' } },
          { filename: { endsWith: '.odt', mode: 'insensitive' } },
        ];
      } else if (cat === 'code') {
        where.OR = [
          { mimeType: { in: ['application/json', 'application/javascript', 'application/typescript', 'text/javascript', 'text/typescript', 'text/x-python', 'text/x-golang', 'text/rust', 'text/html', 'text/css', 'application/sql', 'application/x-yaml', 'application/xml', 'text/xml'] } },
          { filename: { endsWith: '.js', mode: 'insensitive' } },
          { filename: { endsWith: '.ts', mode: 'insensitive' } },
          { filename: { endsWith: '.tsx', mode: 'insensitive' } },
          { filename: { endsWith: '.jsx', mode: 'insensitive' } },
          { filename: { endsWith: '.py', mode: 'insensitive' } },
          { filename: { endsWith: '.java', mode: 'insensitive' } },
          { filename: { endsWith: '.c', mode: 'insensitive' } },
          { filename: { endsWith: '.cpp', mode: 'insensitive' } },
          { filename: { endsWith: '.cs', mode: 'insensitive' } },
          { filename: { endsWith: '.go', mode: 'insensitive' } },
          { filename: { endsWith: '.rs', mode: 'insensitive' } },
          { filename: { endsWith: '.php', mode: 'insensitive' } },
          { filename: { endsWith: '.html', mode: 'insensitive' } },
          { filename: { endsWith: '.css', mode: 'insensitive' } },
          { filename: { endsWith: '.json', mode: 'insensitive' } },
          { filename: { endsWith: '.sql', mode: 'insensitive' } },
          { filename: { endsWith: '.yaml', mode: 'insensitive' } },
          { filename: { endsWith: '.yml', mode: 'insensitive' } },
          { filename: { endsWith: '.sh', mode: 'insensitive' } },
        ];
      } else if (cat === 'videos' || cat === 'video') {
        where.OR = [
          { mimeType: { startsWith: 'video/' } },
          { filename: { endsWith: '.mp4', mode: 'insensitive' } },
          { filename: { endsWith: '.webm', mode: 'insensitive' } },
          { filename: { endsWith: '.mov', mode: 'insensitive' } },
          { filename: { endsWith: '.avi', mode: 'insensitive' } },
          { filename: { endsWith: '.mkv', mode: 'insensitive' } },
        ];
      } else if (cat === 'audio' || cat === 'music') {
        where.OR = [
          { mimeType: { startsWith: 'audio/' } },
          { filename: { endsWith: '.mp3', mode: 'insensitive' } },
          { filename: { endsWith: '.wav', mode: 'insensitive' } },
          { filename: { endsWith: '.ogg', mode: 'insensitive' } },
          { filename: { endsWith: '.m4a', mode: 'insensitive' } },
          { filename: { endsWith: '.flac', mode: 'insensitive' } },
          { filename: { endsWith: '.aac', mode: 'insensitive' } },
        ];
      } else if (cat === 'zips' || cat === 'archives' || cat === 'archive') {
        where.OR = [
          { mimeType: { in: ['application/zip', 'application/x-zip-compressed', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed', 'application/vnd.rar'] } },
          { filename: { endsWith: '.zip', mode: 'insensitive' } },
          { filename: { endsWith: '.tar', mode: 'insensitive' } },
          { filename: { endsWith: '.gz', mode: 'insensitive' } },
          { filename: { endsWith: '.7z', mode: 'insensitive' } },
          { filename: { endsWith: '.rar', mode: 'insensitive' } },
        ];
      }
    }

    if (query.projectId) {
      if (query.projectId === 'all') {
        // Defensive support: 'all' filters files associated with any project
        where.projectId = { not: null };
      } else {
        if (!isValidUuid(query.projectId)) {
          throw new AppError('Invalid project ID format', 400, 'INVALID_PROJECT_ID');
        }
        const project = await db.project.findUnique({
          where: { id: query.projectId },
        });
        if (!project) {
          throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
        }
        const isProjectOwner = project.ownerId === query.userId;
        const isProjectWsMember = await db.workspaceMember.findFirst({
          where: { workspaceId: project.workspaceId, userId: query.userId },
        });
        if (!isProjectOwner && !isProjectWsMember) {
          throw new AppError('Forbidden: you do not have access to this project', 403, 'FORBIDDEN');
        }
        if (query.workspaceId && project.workspaceId !== query.workspaceId) {
          throw new AppError('Project does not belong to specified workspace', 400, 'PROJECT_WORKSPACE_MISMATCH');
        }
        where.projectId = query.projectId;
        where.workspaceId = project.workspaceId;
      }
    } else if (query.hasProject) {
      where.projectId = { not: null };
    } else if (query.workspaceId && isValidUuid(query.workspaceId)) {
      const isMember = await db.workspaceMember.findFirst({
        where: { workspaceId: query.workspaceId, userId: query.userId },
      });
      if (isMember) {
        where.workspaceId = query.workspaceId;
      } else {
        return {
          files: [],
          pagination: { total: 0, page: 1, limit, totalPages: 0 },
        };
      }
    } else {
      where.userId = query.userId;
    }

    // Favorites lookup
    let favoriteFileIds = new Set<string>();
    try {
      const favs = await db.userFavorite.findMany({
        where: { userId: query.userId, resourceType: 'file' },
        select: { resourceId: true },
      });
      favoriteFileIds = new Set(favs.map((f) => f.resourceId));
      if (query.favoriteOnly) {
        where.id = { in: Array.from(favoriteFileIds) };
      }
    } catch {
      // ignore favorite lookup errors
    }

    try {
      const [files, total] = await Promise.all([
        db.file.findMany({
          where,
          include: {
            folder: { select: { id: true, name: true } },
            _count: { select: { versions: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.file.count({ where }),
      ]);

      const formatted = files.map((f: any) => {
        let isTrashed = Boolean(f.isTrash);
        let trashedAt = f.deletedAt ? toSafeIsoString(f.deletedAt) : null;
        let originalFolderId: string | null = null;
        if (f.description && f.description.startsWith('__TRASH__')) {
          const parsed = parseTrashMarker(f.description);
          isTrashed = true;
          trashedAt = trashedAt || parsed.trashedAt;
          originalFolderId = parsed.originalFolderId;
        }
        const detected = detectFileType(null, f.filename, f.mimeType);
        const folderName = f.folder?.name?.toLowerCase() === 'vk' ? 'Storage' : (f.folder?.name || null);
        return {
          id: f.id,
          filename: f.filename,
          originalName: f.filename,
          mimeType: f.mimeType,
          detectedMimeType: detected.detectedMimeType,
          extension: detected.extension,
          category: detected.category,
          previewType: detected.previewType,
          previewAvailable: detected.previewAvailable,
          size: f.size,
          sizeStr: formatBytes(f.size),
          storagePath: f.storagePath,
          status: f.status,
          userId: f.userId,
          workspaceId: f.workspaceId,
          projectId: f.projectId,
          folderId: f.folderId,
          folder: f.folder ? { id: f.folder.id, name: folderName } : null,
          folderName,
          isFavorite: favoriteFileIds.has(f.id),
          isTrash: isTrashed,
          trashedAt,
          versionCount: (f._count?.versions || 0) + 1,
          createdAt: toSafeIsoString(f.createdAt),
          uploadedAt: toSafeIsoString(f.createdAt),
          updatedAt: toSafeIsoString(f.updatedAt),
          type: inferFileType(f.mimeType, f.filename),
        };
      });

      return {
        files: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages: total > 0 ? Math.ceil(total / limit) : 0,
        },
      };
    } catch (err) {
      logger.warn('Error listing files from DB, returning empty set:', err);
      return {
        files: [],
        pagination: { total: 0, page: 1, limit, totalPages: 0 },
      };
    }
  }

  public async deleteFile(id: string, userId?: string) {
    if (!isValidUuid(id)) {
      return { success: true, message: 'Invalid file ID or file already removed' };
    }
    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    try {
      const existing = await db.file.findUnique({ where: { id } });
      if (existing) {
        if (existing.userId && existing.userId !== userId) {
          let isAuthorized = false;
          if (existing.workspaceId) {
            const membership = await db.workspaceMember.findFirst({
              where: {
                workspaceId: existing.workspaceId,
                userId,
                role: { in: ['OWNER', 'ADMIN'] },
              },
            });
            isAuthorized = !!membership;
          }
          if (!isAuthorized) {
            throw new AppError('Unauthorized to delete this file', 403, 'FORBIDDEN');
          }
        }
        const safeBaseName = path.basename(existing.storagePath);
        const fullPath = path.resolve(UPLOAD_DIR, safeBaseName);
        if (!fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
          throw new AppError('Unauthorized path access', 403, 'FORBIDDEN');
        }
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
          } catch {}
        }

        // Clean up any version physical files on disk
        try {
          const versions = await db.fileVersion.findMany({ where: { fileId: id } });
          for (const v of versions) {
            if (v.storagePath) {
              const vDiskPath = path.resolve(UPLOAD_DIR, v.storagePath);
              if (fs.existsSync(vDiskPath)) {
                try {
                  fs.unlinkSync(vDiskPath);
                } catch {}
              }
            }
          }
        } catch {}

        // Clean up userFavorite records referencing this file
        try {
          await db.userFavorite.deleteMany({
            where: { resourceId: id, resourceType: 'file' },
          });
        } catch {}

        // Clean up knowledge document references
        try {
          await db.document.deleteMany({
            where: {
              fileUrl: { contains: id },
            },
          });
        } catch {}

        await db.file.delete({ where: { id } });
      }
      return { success: true };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('Error during file deletion:', err);
      return { success: true, message: 'File removal handled' };
    }
  }

  public async renameFile(id: string, newName: string, userId?: string) {
    if (!isValidUuid(id)) {
      throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    }
    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    if (
      !newName ||
      newName.includes('/') ||
      newName.includes('\\') ||
      newName.includes('..') ||
      newName.trim().length === 0
    ) {
      throw new AppError('Valid new filename required without path separators', 400, 'FILENAME_REQUIRED');
    }

    const sanitizedNewName = path.basename(newName).replace(/[\0\r\n\t]/g, '').trim();
    if (!sanitizedNewName || sanitizedNewName === '.' || sanitizedNewName === '..') {
      throw new AppError('Valid new filename required without path separators', 400, 'FILENAME_REQUIRED');
    }

    const existing = await db.file.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    }
    if (existing.userId && existing.userId !== userId) {
      let isAuthorized = false;
      if (existing.workspaceId) {
        const membership = await db.workspaceMember.findFirst({
          where: {
            workspaceId: existing.workspaceId,
            userId,
            role: { in: ['OWNER', 'ADMIN'] },
          },
        });
        isAuthorized = !!membership;
      }
      if (!isAuthorized) {
        throw new AppError('Unauthorized to modify this file', 403, 'FORBIDDEN');
      }
    }

    return db.file.update({
      where: { id },
      data: { filename: sanitizedNewName },
    });
  }

  public async getFileById(
    id: string,
    userId?: string,
    projectId?: string,
    workspaceId?: string,
  ) {
    if (!isValidUuid(id)) return null;
    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    const file = await db.file.findUnique({ where: { id } });
    if (!file) return null;

    // Validate project context if projectId is requested
    if (projectId) {
      if (!isValidUuid(projectId)) {
        throw new AppError('Invalid project ID format', 400, 'INVALID_PROJECT_ID');
      }
      if (file.projectId && file.projectId !== projectId) {
        throw new AppError('Forbidden: file does not belong to specified project', 403, 'FORBIDDEN');
      }
      if (!file.projectId) {
        throw new AppError('Forbidden: file does not belong to specified project', 403, 'FORBIDDEN');
      }
    }

    // Validate project access if file belongs to a project
    if (file.projectId) {
      const project = await db.project.findUnique({ where: { id: file.projectId } });
      if (project) {
        const isProjectOwner = project.ownerId === userId;
        const isProjectWsMember = await db.workspaceMember.findFirst({
          where: { workspaceId: project.workspaceId, userId },
        });
        if (!isProjectOwner && !isProjectWsMember) {
          throw new AppError('Forbidden: you do not have access to this project', 403, 'FORBIDDEN');
        }
      }
    }

    // Validate workspace context if workspaceId is requested
    if (workspaceId) {
      if (!isValidUuid(workspaceId)) {
        throw new AppError('Invalid workspace ID format', 400, 'INVALID_WORKSPACE_ID');
      }
      if (file.workspaceId && file.workspaceId !== workspaceId) {
        throw new AppError('Forbidden: file does not belong to specified workspace', 403, 'FORBIDDEN');
      }
    }

    if (file.userId && file.userId !== userId) {
      let isMember = false;
      if (file.workspaceId) {
        const membership = await db.workspaceMember.findFirst({
          where: { workspaceId: file.workspaceId, userId },
        });
        isMember = !!membership;
      }
      if (!isMember) {
        throw new AppError('Unauthorized to access this file', 403, 'FORBIDDEN');
      }
    }
    const safeBaseName = file.storagePath ? path.basename(file.storagePath) : '';
    const fullPath = safeBaseName ? path.resolve(UPLOAD_DIR, safeBaseName) : '';
    if (fullPath && !fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
      throw new AppError('Unauthorized path access', 403, 'FORBIDDEN');
    }
    this.recordAccess(id);
    const detected = detectFileType(null, file.filename, file.mimeType);
    return {
      ...file,
      originalName: file.filename,
      detectedMimeType: detected.detectedMimeType,
      extension: detected.extension,
      category: detected.category,
      previewType: detected.previewType,
      previewAvailable: detected.previewAvailable,
      sizeStr: formatBytes(file.size),
      fullPath,
    };
  }

  public async inspectArchive(fileRecord: any): Promise<{
    isArchive: boolean;
    filename: string;
    totalFiles: number;
    totalUncompressedSize: number;
    entries: Array<{ path: string; size: number; isDir: boolean }>;
  }> {
    const fileData = await this.getFileStreamOrBuffer(fileRecord);
    let buffer = fileData.buffer;
    if (!buffer && fileData.fullPath && fs.existsSync(fileData.fullPath)) {
      buffer = fs.readFileSync(fileData.fullPath);
    }
    if (!buffer) {
      throw new AppError('The requested file is not available in storage', 404, 'FILE_NOT_FOUND');
    }

    try {
      const rawEntries = parseZipEntries(buffer);
      const entries = rawEntries.map((e) => ({
        path: e.filename,
        size: e.uncompressedSize,
        isDir: e.filename.endsWith('/') || e.uncompressedSize === 0,
      }));
      const totalUncompressedSize = rawEntries.reduce((acc, e) => acc + (e.uncompressedSize || 0), 0);

      return {
        isArchive: true,
        filename: fileRecord.filename,
        totalFiles: entries.filter((e) => !e.isDir).length,
        totalUncompressedSize,
        entries,
      };
    } catch {
      return {
        isArchive: true,
        filename: fileRecord.filename,
        totalFiles: 0,
        totalUncompressedSize: fileRecord.size,
        entries: [],
      };
    }
  }

  public async getFileStreamOrBuffer(fileRecord: {
    id: string;
    storagePath?: string | null;
    fullPath?: string;
  }): Promise<{ buffer?: Buffer; fullPath?: string }> {
    const fullPath = fileRecord.fullPath;
    if (fullPath && fs.existsSync(fullPath)) {
      return { fullPath };
    }

    if (fileRecord.storagePath) {
      try {
        const buffer = await this.storageService.getFileBuffer(fileRecord.storagePath);
        if (buffer && buffer.length > 0) {
          return { buffer };
        }
      } catch (storageErr) {
        logger.warn(
          `StorageService could not retrieve buffer for ${fileRecord.id} (${fileRecord.storagePath}):`,
          storageErr,
        );
      }
    }

    return {};
  }

  public recordAccess(id: string): void {
    if (!isValidUuid(id)) return;
    db.file
      .updateMany({
        where: { id },
        data: { lastAccessedAt: new Date() },
      })
      .catch((err) => {
        logger.debug(`Could not update lastAccessedAt for file ${id}:`, err);
      });
  }

  public async updateFileContent(
    id: string,
    content: string,
    userId: string,
    commentOrOptions?: string | { comment?: string; projectId?: string; workspaceId?: string },
    maybeProjectId?: string,
    maybeWorkspaceId?: string,
  ) {
    let comment: string | undefined;
    let projectId: string | undefined = maybeProjectId;
    let workspaceId: string | undefined = maybeWorkspaceId;

    if (typeof commentOrOptions === 'object' && commentOrOptions !== null) {
      comment = commentOrOptions.comment;
      if (commentOrOptions.projectId) projectId = commentOrOptions.projectId;
      if (commentOrOptions.workspaceId) workspaceId = commentOrOptions.workspaceId;
    } else {
      comment = commentOrOptions;
    }

    if (!isValidUuid(id)) {
      throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    }
    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    if (typeof content !== 'string') {
      throw new AppError('Content must be a string', 400, 'INVALID_CONTENT');
    }

    const existing = await db.file.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!existing) {
      throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    // Validate project context if projectId is requested
    if (projectId) {
      if (!isValidUuid(projectId)) {
        throw new AppError('Invalid project ID format', 400, 'INVALID_PROJECT_ID');
      }
      if (existing.projectId && existing.projectId !== projectId) {
        throw new AppError('Forbidden: file does not belong to specified project', 403, 'FORBIDDEN');
      }
      if (!existing.projectId) {
        throw new AppError('Forbidden: file does not belong to specified project', 403, 'FORBIDDEN');
      }
    }

    // Validate workspace context if workspaceId is requested
    if (workspaceId) {
      if (!isValidUuid(workspaceId)) {
        throw new AppError('Invalid workspace ID format', 400, 'INVALID_WORKSPACE_ID');
      }
      if (existing.workspaceId && existing.workspaceId !== workspaceId) {
        throw new AppError('Forbidden: file does not belong to specified workspace', 403, 'FORBIDDEN');
      }
    }

    // Authorization check: owner, or member of workspace/project with write access
    if (existing.userId && existing.userId !== userId) {
      let isAuthorized = false;
      if (existing.workspaceId) {
        const membership = await db.workspaceMember.findFirst({
          where: {
            workspaceId: existing.workspaceId,
            userId,
            role: { in: ['OWNER', 'ADMIN', 'MEMBER'] },
          },
        });
        isAuthorized = !!membership;
      }
      if (!isAuthorized && existing.projectId) {
        const project = await db.project.findUnique({ where: { id: existing.projectId } });
        if (project && project.ownerId === userId) {
          isAuthorized = true;
        }
      }
      if (!isAuthorized) {
        throw new AppError('Forbidden: you do not have permission to edit this file', 403, 'FORBIDDEN');
      }
    }

    // Prevent overwriting binary Office and media files with plain text
    const isBinaryOffice =
      /\.(docx|xlsx|pptx|doc|xls|ppt)$/i.test(existing.filename) ||
      existing.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      existing.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      existing.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      existing.mimeType === 'application/msword' ||
      existing.mimeType === 'application/vnd.ms-excel' ||
      existing.mimeType === 'application/vnd.ms-powerpoint';

    if (isBinaryOffice) {
      throw new AppError(
        'Direct text editing is not supported for binary Office documents. The original binary file cannot be overwritten with plain text.',
        400,
        'BINARY_OFFICE_EDIT_UNSUPPORTED',
      );
    }

    const rawPath = existing.storagePath || (existing as any).path || existing.filename;
    const safeBaseName = path.basename(rawPath);
    const activeFilePath = path.resolve(UPLOAD_DIR, safeBaseName);
    if (!activeFilePath.startsWith(path.resolve(UPLOAD_DIR))) {
      throw new AppError('Invalid file storage path', 400, 'INVALID_PATH');
    }

    // Phase 4: Version current file before overwriting
    let currentBuffer: Buffer | null = null;
    if (fs.existsSync(activeFilePath)) {
      try {
        currentBuffer = fs.readFileSync(activeFilePath);
      } catch (readErr) {
        logger.warn('Could not read existing file before versioning:', readErr);
      }
    } else if (existing.storagePath) {
      try {
        currentBuffer = (await this.storageService.getFileBuffer(existing.storagePath)) || null;
      } catch {}
    }

    let createdVersion: any = null;
    if (currentBuffer && currentBuffer.length > 0) {
      const lastVersionNum = existing.versions?.[0]?.version || 0;
      const nextVersionNum = lastVersionNum + 1;
      const rawExt = path.extname(safeBaseName);
      const versionFileName = `${existing.id}_v${nextVersionNum}_${Date.now()}${rawExt}`;
      const versionStoragePath = path.join('versions', versionFileName);
      const versionDiskPath = path.resolve(VERSIONS_DIR, versionFileName);

      try {
        fs.writeFileSync(versionDiskPath, currentBuffer);
        createdVersion = await db.fileVersion.create({
          data: {
            fileId: existing.id,
            version: nextVersionNum,
            size: currentBuffer.length,
            storagePath: versionStoragePath,
            createdBy: userId,
            comment: comment || `Saved version ${nextVersionNum}`,
          },
        });

        // Sync version snapshot to Cloud Storage if configured
        if (env.STORAGE_DRIVER === 'supabase') {
          try {
            await this.storageService.upload(
              currentBuffer,
              versionStoragePath,
              existing.mimeType || 'application/octet-stream',
            );
          } catch (cloudVerErr) {
            logger.warn('StorageService cloud version upload failed:', cloudVerErr);
          }
        }
      } catch (verErr) {
        logger.warn('Could not create version record:', verErr);
      }
    }

    // Write new content to active file
    const newBuffer = Buffer.from(content, 'utf-8');
    try {
      fs.writeFileSync(activeFilePath, newBuffer);
    } catch (fsErr) {
      logger.error('Failed to write updated file to disk:', fsErr);
      throw new AppError('Failed to save file content', 500, 'FILE_STORAGE_ERROR');
    }

    // Sync to Cloud Storage if configured
    try {
      if (env.STORAGE_DRIVER === 'supabase') {
        await this.storageService.upload(
          newBuffer,
          safeBaseName,
          existing.mimeType || 'text/plain',
        );
      }
    } catch (cloudErr) {
      logger.warn('StorageService cloud update failed; local copy remains active:', cloudErr);
    }

    const updatedFile = await db.file.update({
      where: { id },
      data: {
        size: newBuffer.length,
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
      },
    });

    return { file: updatedFile, version: createdVersion };
  }

  public async extractText(
    id: string,
    userId: string,
    projectId?: string,
    workspaceId?: string,
  ) {
    const fileRecord = await this.getFileById(id, userId, projectId, workspaceId);
    if (!fileRecord) {
      throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    this.recordAccess(id);

    const fileData = await this.getFileStreamOrBuffer(fileRecord);
    let buffer: Buffer | null = fileData.buffer || null;
    if (!buffer && fileData.fullPath && fs.existsSync(fileData.fullPath)) {
      buffer = fs.readFileSync(fileData.fullPath);
    }

    if (!buffer) {
      throw new AppError('File content could not be loaded from storage', 404, 'FILE_NOT_FOUND');
    }

    const mimeType = fileRecord.mimeType || 'application/octet-stream';

    // Direct text decode for code / plain text / markdown / json / csv / structured data
    const isDirectText =
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/javascript' ||
      mimeType === 'application/typescript' ||
      mimeType === 'application/sql' ||
      mimeType === 'application/x-yaml' ||
      mimeType === 'application/toml' ||
      /\.(txt|md|markdown|json|js|ts|tsx|jsx|html|htm|css|py|sh|bash|yaml|yml|xml|log|env|sql|java|c|cpp|h|hpp|cs|go|rs|php|tsv|toml|ini|conf)$/i.test(
        fileRecord.filename,
      );

    if (isDirectText) {
      const text = buffer.toString('utf-8');
      return {
        text,
        format: path.extname(fileRecord.filename).replace(/^\./, '').toUpperCase() || 'TEXT',
        characterCount: text.length,
        lineCount: text.split('\n').length,
        mimeType,
        filename: fileRecord.filename,
      };
    }

    // Use documentParser for DOCX, XLSX, PDF, HTML, etc.
    const parseResult = await documentParser.parse({
      id: fileRecord.id,
      content: buffer,
      mimeType,
      loadedAt: Date.now(),
      metadata: { filename: fileRecord.filename },
    });

    if (!parseResult.ok) {
      throw new AppError(
        `Text extraction failed: ${parseResult.error.message}`,
        422,
        'TEXT_EXTRACTION_FAILED',
      );
    }

    const text = parseResult.value.text;
    return {
      text,
      format: (parseResult.value.metadata?.format as string) || 'DOCUMENT',
      characterCount: text.length,
      lineCount: text.split('\n').length,
      mimeType,
      filename: fileRecord.filename,
    };
  }

  public async getRecentFiles(query: {
    userId: string;
    workspaceId?: string;
    projectId?: string;
    limit?: number;
  }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      return [];
    }
    const limit = Math.min(50, Math.max(1, query.limit || 20));

    // 24-hour Recent rule: files become eligible for Recent view after 24 hours from upload
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const where: any = {
      isTrash: false,
      OR: [
        { description: null },
        { NOT: { description: { startsWith: '__TRASH__' } } },
      ],
      createdAt: { lte: twentyFourHoursAgo },
    };
    if (query.projectId) {
      if (query.projectId === 'all') {
        where.projectId = { not: null };
      } else {
        if (!isValidUuid(query.projectId)) {
          throw new AppError('Invalid project ID format', 400, 'INVALID_PROJECT_ID');
        }
        where.projectId = query.projectId;
      }
    } else if (query.workspaceId && isValidUuid(query.workspaceId)) {
      const isMember = await db.workspaceMember.findFirst({
        where: { workspaceId: query.workspaceId, userId: query.userId },
      });
      if (!isMember) {
        return [];
      }
      where.workspaceId = query.workspaceId;
    } else {
      where.userId = query.userId;
    }

    const files = await db.file.findMany({
      where,
      include: {
        folder: { select: { id: true, name: true } },
        _count: { select: { versions: true } },
      },
      orderBy: [
        { lastAccessedAt: 'desc' },
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return files.map((f: any) => {
      const detected = detectFileType(null, f.filename, f.mimeType);
      const folderName = f.folder?.name?.toLowerCase() === 'vk' ? 'Storage' : (f.folder?.name || null);
      return {
        id: f.id,
        name: f.filename,
        filename: f.filename,
        originalName: f.filename,
        mimeType: f.mimeType,
        detectedMimeType: detected.detectedMimeType,
        extension: detected.extension,
        category: detected.category,
        previewType: detected.previewType,
        previewAvailable: detected.previewAvailable,
        type: inferFileType(f.mimeType, f.filename),
        lastAccessed: toSafeIsoString(f.lastAccessedAt || f.updatedAt || f.createdAt),
        lastAccessedAt: f.lastAccessedAt ? toSafeIsoString(f.lastAccessedAt) : null,
        sizeStr: formatBytes(f.size),
        size: f.size,
        folderId: f.folderId,
        folder: f.folder ? { id: f.folder.id, name: folderName } : null,
        folderName,
        location: folderName
          ? `Workspace Files / ${folderName}`
          : (f.projectId ? 'Project Files' : 'Workspace Files'),
        projectId: f.projectId,
        workspaceId: f.workspaceId,
        createdAt: toSafeIsoString(f.createdAt),
        uploadedAt: toSafeIsoString(f.createdAt),
        updatedAt: toSafeIsoString(f.updatedAt),
      };
    });
  }

  public async getFileVersions(
    fileId: string,
    userId: string,
    projectIdOrOptions?: string | { projectId?: string; workspaceId?: string },
    maybeWorkspaceId?: string,
  ) {
    let projectId: string | undefined;
    let workspaceId: string | undefined = maybeWorkspaceId;

    if (typeof projectIdOrOptions === 'object' && projectIdOrOptions !== null) {
      projectId = projectIdOrOptions.projectId;
      workspaceId = projectIdOrOptions.workspaceId;
    } else {
      projectId = projectIdOrOptions;
    }

    if (!isValidUuid(fileId)) {
      throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    }
    const file = await this.getFileById(fileId, userId, projectId, workspaceId);
    if (!file) {
      throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const versions = await db.fileVersion.findMany({
      where: { fileId },
      orderBy: { version: 'desc' },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      size: v.size,
      sizeStr: formatBytes(v.size),
      comment: v.comment,
      createdAt: toSafeIsoString(v.createdAt),
      createdBy: v.user?.fullName || v.user?.email || 'Unknown',
    }));
  }

  public async restoreFileVersion(
    fileId: string,
    versionId: string,
    userId: string,
    projectIdOrOptions?: string | { projectId?: string; workspaceId?: string },
    maybeWorkspaceId?: string,
  ) {
    let projectId: string | undefined;
    let workspaceId: string | undefined = maybeWorkspaceId;

    if (typeof projectIdOrOptions === 'object' && projectIdOrOptions !== null) {
      projectId = projectIdOrOptions.projectId;
      workspaceId = projectIdOrOptions.workspaceId;
    } else {
      projectId = projectIdOrOptions;
    }

    if (!isValidUuid(fileId) || !isValidUuid(versionId)) {
      throw new AppError('Invalid file or version ID', 400, 'INVALID_ID');
    }
    const file = await this.getFileById(fileId, userId, projectId, workspaceId);
    if (!file) {
      throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const targetVersion = await db.fileVersion.findUnique({
      where: { id: versionId },
    });
    if (!targetVersion || targetVersion.fileId !== fileId) {
      throw new AppError('Version not found', 404, 'VERSION_NOT_FOUND');
    }

    const versionDiskPath = path.resolve(UPLOAD_DIR, targetVersion.storagePath);
    let versionBuffer: Buffer | null = null;
    if (versionDiskPath.startsWith(path.resolve(UPLOAD_DIR)) && fs.existsSync(versionDiskPath)) {
      versionBuffer = fs.readFileSync(versionDiskPath);
    } else if (targetVersion.storagePath) {
      try {
        versionBuffer = await this.storageService.getFileBuffer(targetVersion.storagePath);
      } catch (cloudErr) {
        logger.warn('StorageService could not retrieve version snapshot:', cloudErr);
      }
    }

    if (!versionBuffer) {
      throw new AppError('Version storage file not found', 404, 'VERSION_FILE_MISSING');
    }

    const versionContent = versionBuffer.toString('utf-8');

    if (projectId || workspaceId) {
      return this.updateFileContent(
        fileId,
        versionContent,
        userId,
        `Restored from Version ${targetVersion.version}`,
        projectId,
        workspaceId,
      );
    }

    return this.updateFileContent(
      fileId,
      versionContent,
      userId,
      `Restored from Version ${targetVersion.version}`,
    );
  }

  // ==========================================================================
  // FOLDER MANAGEMENT
  // ==========================================================================

  public async listFolders(query: {
    userId: string;
    workspaceId?: string | null;
    parentId?: string | null;
    projectId?: string | null;
  }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const where: any = {
      userId: query.userId,
      type: 'FILES',
    };
    if (query.workspaceId && isValidUuid(query.workspaceId)) {
      where.workspaceId = query.workspaceId;
    }
    if (query.parentId !== undefined) {
      if (query.parentId === 'root' || query.parentId === null) {
        where.parentId = null;
      } else if (isValidUuid(query.parentId)) {
        where.parentId = query.parentId;
      }
    }
    const folders = await db.folder.findMany({
      where,
      include: {
        _count: { select: { files: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
    return folders.map((f: any) => ({
      id: f.id,
      name: f.name.toLowerCase() === 'vk' ? 'Storage' : f.name,
      parentId: f.parentId,
      workspaceId: f.workspaceId,
      userId: f.userId,
      fileCount: f._count?.files || 0,
      subfolderCount: f._count?.children || 0,
      createdAt: toSafeIsoString(f.createdAt),
      updatedAt: toSafeIsoString(f.updatedAt),
    }));
  }

  public async createFolder(query: {
    userId: string;
    name: string;
    parentId?: string | null;
    workspaceId?: string | null;
  }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    let trimmed = (query.name || '').trim();
    if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..') {
      throw new AppError('Valid folder name required without path separators', 400, 'FOLDER_NAME_INVALID');
    }
    if (trimmed.toLowerCase() === 'vk') {
      trimmed = 'Storage';
    }
    let parentId: string | null = null;
    if (query.parentId && query.parentId !== 'root' && isValidUuid(query.parentId)) {
      const parent = await db.folder.findUnique({ where: { id: query.parentId } });
      if (!parent || parent.userId !== query.userId) {
        throw new AppError('Parent folder not found or forbidden', 404, 'PARENT_FOLDER_NOT_FOUND');
      }
      parentId = query.parentId;
    }
    let workspaceId = query.workspaceId && isValidUuid(query.workspaceId) ? query.workspaceId : null;
    if (!workspaceId) {
      const member = await db.workspaceMember.findFirst({ where: { userId: query.userId } });
      if (member) workspaceId = member.workspaceId;
    }
    if (!workspaceId) {
      const ws = await db.workspace.findFirst();
      if (ws) workspaceId = ws.id;
    }
    if (!workspaceId) {
      throw new AppError('Valid workspace required to create folder', 400, 'WORKSPACE_REQUIRED');
    }

    const folder = await db.folder.create({
      data: {
        name: trimmed,
        parentId,
        userId: query.userId,
        workspaceId,
        type: 'FILES',
      },
    });
    return folder;
  }

  public async renameFolder(folderId: string, name: string, userId: string) {
    if (!isValidUuid(folderId)) throw new AppError('Invalid folder ID', 400, 'INVALID_FOLDER_ID');
    const trimmed = (name || '').trim();
    if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..') {
      throw new AppError('Valid folder name required without path separators', 400, 'FOLDER_NAME_INVALID');
    }
    const folder = await db.folder.findUnique({ where: { id: folderId } });
    if (!folder) throw new AppError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    if (folder.userId !== userId) throw new AppError('Forbidden: you do not own this folder', 403, 'FORBIDDEN');

    return db.folder.update({
      where: { id: folderId },
      data: { name: trimmed },
    });
  }

  public async deleteFolder(folderId: string, userId: string) {
    if (!isValidUuid(folderId)) throw new AppError('Invalid folder ID', 400, 'INVALID_FOLDER_ID');
    const folder = await db.folder.findUnique({ where: { id: folderId }, include: { children: true, files: true } });
    if (!folder) throw new AppError('Folder not found', 404, 'FOLDER_NOT_FOUND');
    if (folder.userId !== userId) throw new AppError('Forbidden: you do not own this folder', 403, 'FORBIDDEN');

    // Move child files and subfolders to parent
    await db.file.updateMany({
      where: { folderId },
      data: { folderId: folder.parentId || null },
    });
    await db.folder.updateMany({
      where: { parentId: folderId },
      data: { parentId: folder.parentId || null },
    });

    await db.folder.delete({ where: { id: folderId } });
    return { success: true, message: 'Folder deleted successfully' };
  }

  public async getFolderBreadcrumbs(folderId: string, userId: string) {
    if (!isValidUuid(folderId)) return [];
    const breadcrumbs: Array<{ id: string; name: string }> = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder: any = await db.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true, userId: true },
      });
      if (!folder || folder.userId !== userId) break;
      breadcrumbs.unshift({
        id: folder.id,
        name: folder.name.toLowerCase() === 'vk' ? 'Storage' : folder.name,
      });
      currentId = folder.parentId;
    }
    return breadcrumbs;
  }

  // ==========================================================================
  // FILE OPERATIONS: MOVE, COPY, EMPTY FILE
  // ==========================================================================

  public async moveFile(
    fileId: string,
    userId: string,
    targetFolderId?: string | null,
    targetProjectId?: string | null,
  ) {
    if (!isValidUuid(fileId)) throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    const file = await this.getFileById(fileId, userId);
    if (!file) throw new AppError('File not found', 404, 'FILE_NOT_FOUND');

    let cleanFolderId: string | null = null;
    if (targetFolderId && targetFolderId !== 'root') {
      if (!isValidUuid(targetFolderId)) throw new AppError('Invalid folder ID format', 400, 'INVALID_FOLDER_ID');
      const folder = await db.folder.findUnique({ where: { id: targetFolderId } });
      if (!folder || folder.userId !== userId) throw new AppError('Target folder not found or forbidden', 404, 'FOLDER_NOT_FOUND');
      cleanFolderId = targetFolderId;
    }

    let cleanProjectId: string | null = null;
    if (targetProjectId) {
      if (!isValidUuid(targetProjectId)) throw new AppError('Invalid project ID format', 400, 'INVALID_PROJECT_ID');
      const project = await db.project.findUnique({ where: { id: targetProjectId } });
      if (!project) throw new AppError('Target project not found', 404, 'PROJECT_NOT_FOUND');
      cleanProjectId = targetProjectId;
    }

    const updateData: any = {};
    if (targetFolderId !== undefined) updateData.folderId = cleanFolderId;
    if (targetProjectId !== undefined) updateData.projectId = cleanProjectId;

    return db.file.update({
      where: { id: fileId },
      data: updateData,
    });
  }

  public async copyFile(fileId: string, userId: string, targetFolderId?: string | null) {
    if (!isValidUuid(fileId)) throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    const file = await this.getFileById(fileId, userId);
    if (!file) throw new AppError('File not found', 404, 'FILE_NOT_FOUND');

    const ext = path.extname(file.filename);
    const base = path.basename(file.filename, ext);
    const newFilename = `${base} (Copy)${ext}`;

    // Read original file buffer
    const fileData = await this.getFileStreamOrBuffer(file);
    let buffer: Buffer | null = fileData.buffer || null;
    if (!buffer && fileData.fullPath && fs.existsSync(fileData.fullPath)) {
      buffer = fs.readFileSync(fileData.fullPath);
    }
    if (!buffer) {
      throw new AppError('Original file could not be read from storage', 404, 'FILE_NOT_FOUND');
    }

    const newStorageName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${path.basename(newFilename)}`;
    const newDiskPath = path.resolve(UPLOAD_DIR, newStorageName);
    fs.writeFileSync(newDiskPath, buffer);

    try {
      await this.storageService.upload(buffer, newStorageName, file.mimeType);
    } catch {
      // cloud upload fallback
    }

    return db.file.create({
      data: {
        filename: newFilename,
        mimeType: file.mimeType,
        size: buffer.length,
        storagePath: newStorageName,
        status: FileStatus.READY,
        userId,
        workspaceId: file.workspaceId,
        projectId: file.projectId,
        folderId: targetFolderId !== undefined ? targetFolderId : file.folderId,
      },
    });
  }

  public async createEmptyFile(query: {
    userId: string;
    filename: string;
    content?: string;
    folderId?: string | null;
    workspaceId?: string | null;
    projectId?: string | null;
  }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const filename = (query.filename || '').trim();
    if (!filename || filename.includes('/') || filename.includes('\\') || filename === '.' || filename === '..') {
      throw new AppError('Valid filename required', 400, 'FILENAME_REQUIRED');
    }
    const content = query.content || '';
    const buffer = Buffer.from(content, 'utf-8');

    let mimeType = 'text/plain';
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.md' || ext === '.markdown') mimeType = 'text/markdown';
    else if (ext === '.json') mimeType = 'application/json';
    else if (ext === '.csv') mimeType = 'text/csv';
    else if (ext === '.html') mimeType = 'text/html';
    else if (ext === '.css') mimeType = 'text/css';
    else if (ext === '.js') mimeType = 'application/javascript';
    else if (ext === '.ts') mimeType = 'application/typescript';
    else if (ext === '.py') mimeType = 'text/x-python';
    else if (ext === '.sql') mimeType = 'application/sql';
    else if (ext === '.yaml' || ext === '.yml') mimeType = 'application/x-yaml';

    const storageName = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}_${path.basename(filename)}`;
    const diskPath = path.resolve(UPLOAD_DIR, storageName);
    fs.writeFileSync(diskPath, buffer);

    let cleanFolderId = query.folderId && isValidUuid(query.folderId) ? query.folderId : null;
    let cleanWorkspaceId = query.workspaceId && isValidUuid(query.workspaceId) ? query.workspaceId : null;
    if (!cleanWorkspaceId) {
      const member = await db.workspaceMember.findFirst({ where: { userId: query.userId } });
      if (member) cleanWorkspaceId = member.workspaceId;
    }

    return db.file.create({
      data: {
        filename,
        mimeType,
        size: buffer.length,
        storagePath: storageName,
        status: FileStatus.READY,
        userId: query.userId,
        workspaceId: cleanWorkspaceId,
        projectId: query.projectId && isValidUuid(query.projectId) ? query.projectId : null,
        folderId: cleanFolderId,
      },
    });
  }

  // ==========================================================================
  // TRASH LIFECYCLE (SOFT DELETE, RESTORE, EMPTY)
  // ==========================================================================

  public async moveToTrash(fileId: string, userId: string) {
    if (!isValidUuid(fileId)) throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    const file = await this.getFileById(fileId, userId);
    if (!file) throw new AppError('File not found', 404, 'FILE_NOT_FOUND');

    const trashMarker = file.folderId ? `__TRASH__::${new Date().toISOString()}::${file.folderId}` : null;
    return db.file.update({
      where: { id: fileId },
      data: {
        isTrash: true,
        deletedAt: new Date(),
        description: trashMarker,
        folderId: null,
      },
    });
  }

  public async restoreFromTrash(fileId: string, userId: string) {
    if (!isValidUuid(fileId)) throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file) throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
    if (file.userId !== userId) {
      if (file.workspaceId) {
        const mem = await db.workspaceMember.findFirst({
          where: { workspaceId: file.workspaceId, userId, role: { in: ['OWNER', 'ADMIN'] } },
        });
        if (!mem) throw new AppError('Forbidden: you do not have permission to restore this file', 403, 'FORBIDDEN');
      } else {
        throw new AppError('Forbidden: you do not have permission to restore this file', 403, 'FORBIDDEN');
      }
    }

    let targetFolderId: string | null = null;
    if (file.description && file.description.startsWith('__TRASH__')) {
      const { originalFolderId } = parseTrashMarker(file.description);
      if (originalFolderId && isValidUuid(originalFolderId)) {
        const folderExists = await db.folder.findUnique({ where: { id: originalFolderId } });
        if (folderExists) targetFolderId = originalFolderId;
      }
    }

    return db.file.update({
      where: { id: fileId },
      data: {
        isTrash: false,
        deletedAt: null,
        description: null,
        folderId: targetFolderId,
      },
    });
  }

  public async getTrashFiles(query: { userId: string; workspaceId?: string | null }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const where: any = {
      OR: [
        { isTrash: true },
        { description: { startsWith: '__TRASH__' } },
      ],
    };
    if (query.workspaceId && isValidUuid(query.workspaceId)) {
      where.workspaceId = query.workspaceId;
    } else {
      where.userId = query.userId;
    }

    const trashed = await db.file.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return trashed.map((f: any) => {
      let trashedAt = f.deletedAt ? toSafeIsoString(f.deletedAt) : null;
      let originalFolderId: string | null = null;
      if (f.description && f.description.startsWith('__TRASH__')) {
        const parsed = parseTrashMarker(f.description);
        trashedAt = trashedAt || parsed.trashedAt;
        originalFolderId = parsed.originalFolderId;
      }
      return {
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
        size: f.size,
        sizeStr: formatBytes(f.size),
        isTrash: true,
        trashedAt: trashedAt || toSafeIsoString(f.updatedAt),
        originalFolderId,
        type: inferFileType(f.mimeType, f.filename),
        createdAt: toSafeIsoString(f.createdAt),
        updatedAt: toSafeIsoString(f.updatedAt),
      };
    });
  }

  public async emptyTrash(query: { userId: string; workspaceId?: string | null }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const where: any = {
      OR: [
        { isTrash: true },
        { description: { startsWith: '__TRASH__' } },
      ],
    };
    if (query.workspaceId && isValidUuid(query.workspaceId)) {
      where.workspaceId = query.workspaceId;
    } else {
      where.userId = query.userId;
    }

    const trashed = await db.file.findMany({ where });
    let count = 0;
    for (const f of trashed) {
      try {
        await this.deleteFile(f.id, query.userId);
        count++;
      } catch {}
    }
    return { success: true, count, message: `${count} file(s) permanently removed from trash` };
  }

  // ==========================================================================
  // STORAGE INSIGHTS & DUPLICATES
  // ==========================================================================

  public async getStorageInsights(query: { userId: string; workspaceId?: string | null; projectId?: string | null }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const where: any = {
      isTrash: false,
      OR: [
        { description: null },
        { NOT: { description: { startsWith: '__TRASH__' } } },
      ],
    };
    if (query.projectId && isValidUuid(query.projectId)) {
      where.projectId = query.projectId;
    } else if (query.workspaceId && isValidUuid(query.workspaceId)) {
      where.workspaceId = query.workspaceId;
    } else {
      where.userId = query.userId;
    }

    const files = await db.file.findMany({
      where,
      select: { id: true, filename: true, mimeType: true, size: true },
    });

    let totalBytes = 0;
    const categories: Record<string, { bytes: number; count: number }> = {
      documents: { bytes: 0, count: 0 },
      spreadsheets: { bytes: 0, count: 0 },
      presentations: { bytes: 0, count: 0 },
      images: { bytes: 0, count: 0 },
      video: { bytes: 0, count: 0 },
      audio: { bytes: 0, count: 0 },
      code: { bytes: 0, count: 0 },
      archives: { bytes: 0, count: 0 },
      other: { bytes: 0, count: 0 },
    };

    for (const f of files) {
      totalBytes += f.size;
      const m = (f.mimeType || '').toLowerCase();
      const ext = path.extname(f.filename).toLowerCase();

      if (m.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
        categories.images.bytes += f.size;
        categories.images.count += 1;
      } else if (m.startsWith('video/') || ['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) {
        categories.video.bytes += f.size;
        categories.video.count += 1;
      } else if (m.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) {
        categories.audio.bytes += f.size;
        categories.audio.count += 1;
      } else if (m.includes('spreadsheet') || ['.xlsx', '.xls', '.csv'].includes(ext)) {
        categories.spreadsheets.bytes += f.size;
        categories.spreadsheets.count += 1;
      } else if (m.includes('presentation') || ['.pptx', '.ppt'].includes(ext)) {
        categories.presentations.bytes += f.size;
        categories.presentations.count += 1;
      } else if (m === 'application/pdf' || ['.pdf', '.docx', '.doc', '.txt', '.md'].includes(ext)) {
        categories.documents.bytes += f.size;
        categories.documents.count += 1;
      } else if (
        ['.js', '.ts', '.tsx', '.jsx', '.py', '.json', '.html', '.css', '.sql', '.yaml', '.yml', '.sh', '.env'].includes(ext)
      ) {
        categories.code.bytes += f.size;
        categories.code.count += 1;
      } else if (m.includes('zip') || ['.zip', '.tar', '.gz', '.7z', '.rar'].includes(ext)) {
        categories.archives.bytes += f.size;
        categories.archives.count += 1;
      } else {
        categories.other.bytes += f.size;
        categories.other.count += 1;
      }
    }

    const categoryBreakdown = Object.entries(categories).map(([name, stat]) => ({
      name,
      bytes: stat.bytes,
      bytesStr: formatBytes(stat.bytes),
      count: stat.count,
      percentage: totalBytes > 0 ? parseFloat(((stat.bytes / totalBytes) * 100).toFixed(1)) : 0,
    }));

    const usage = await this.getUserStorageUsage(query.userId);

    return {
      totalBytes,
      totalBytesStr: formatBytes(totalBytes),
      totalFiles: files.length,
      categories: categoryBreakdown,
      quotaBytes: usage.quotaBytes,
      quotaBytesStr: usage.quotaBytesStr,
      usedBytes: usage.usedBytes,
      usedBytesStr: usage.usedBytesStr,
      activeBytes: usage.activeBytes,
      activeBytesStr: usage.activeBytesStr,
      trashBytes: usage.trashBytes,
      trashBytesStr: usage.trashBytesStr,
      availableBytes: usage.availableBytes,
      availableBytesStr: usage.availableBytesStr,
      usagePercentage: usage.usagePercentage,
    };
  }

  public async getDuplicateFiles(query: { userId: string; workspaceId?: string | null; projectId?: string | null }) {
    if (!query.userId || !isValidUuid(query.userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const where: any = {
      isTrash: false,
      OR: [
        { description: null },
        { NOT: { description: { startsWith: '__TRASH__' } } },
      ],
    };
    if (query.projectId && isValidUuid(query.projectId)) {
      where.projectId = query.projectId;
    } else if (query.workspaceId && isValidUuid(query.workspaceId)) {
      where.workspaceId = query.workspaceId;
    } else {
      where.userId = query.userId;
    }

    const files = await db.file.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const grouped = new Map<string, any[]>();
    for (const f of files) {
      const normName = f.filename.replace(/\s\((?:Copy|\d+)\)/gi, '').toLowerCase();
      const key = `${f.size}_${normName}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(f);
    }

    const duplicates: Array<{ key: string; size: number; sizeStr: string; files: any[] }> = [];
    for (const [key, group] of grouped.entries()) {
      if (group.length > 1) {
        duplicates.push({
          key,
          size: group[0].size,
          sizeStr: formatBytes(group[0].size),
          files: group.map((f: any) => ({
            id: f.id,
            filename: f.filename,
            size: f.size,
            sizeStr: formatBytes(f.size),
            createdAt: toSafeIsoString(f.createdAt),
            folderId: f.folderId,
          })),
        });
      }
    }

    return duplicates;
  }

  // ==========================================================================
  // ASK AI ABOUT FILE (INTELLIGENCE & ANALYSIS)
  // ==========================================================================

  public async askAIAboutFile(
    fileId: string,
    userId: string,
    question: string,
    projectId?: string,
    workspaceId?: string,
  ) {
    if (!isValidUuid(fileId)) throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    const file = await this.getFileById(fileId, userId, projectId, workspaceId);
    if (!file) throw new AppError('File not found or access denied', 404, 'FILE_NOT_FOUND');

    let textContent = '';
    try {
      const extracted = await this.extractText(fileId, userId, projectId, workspaceId);
      textContent = extracted?.text || '';
    } catch {
      try {
        const fileData = await this.getFileStreamOrBuffer(file);
        if (fileData.buffer) {
          textContent = fileData.buffer.toString('utf-8');
        } else if (fileData.fullPath && fs.existsSync(fileData.fullPath)) {
          textContent = fs.readFileSync(fileData.fullPath, 'utf-8');
        }
      } catch {}
    }

    const wordCount = textContent ? textContent.trim().split(/\s+/).length : 0;
    const lineCount = textContent ? textContent.split(/\r?\n/).length : 0;
    const charCount = textContent.length;

    let answer = '';
    const qLower = (question || '').toLowerCase();

    if (qLower.includes('summar') || qLower === 'summary') {
      const paragraphs = textContent.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
      const summaryPoints = paragraphs.slice(0, 4).map((p) => p.trim().replace(/\n+/g, ' '));
      answer = `**Summary of "${file.filename}"**:\n\n` +
        (summaryPoints.length > 0
          ? summaryPoints.map((p, idx) => `${idx + 1}. ${p.slice(0, 280)}${p.length > 280 ? '...' : ''}`).join('\n\n')
          : `This document contains ${wordCount} words across ${lineCount} lines.`) +
        `\n\n**File Metrics**: ${formatBytes(file.size)} | ${wordCount.toLocaleString()} words | ${lineCount} lines.`;
    } else if (qLower.includes('key point') || qLower.includes('takeaway')) {
      const lines = textContent.split('\n').filter((l) => l.trim().length > 15);
      const points = lines.slice(0, 5);
      answer = `**Key Points in "${file.filename}"**:\n\n` +
        points.map((pt, i) => `• **Point ${i + 1}**: ${pt.trim()}`).join('\n') +
        `\n\n*Extracted from verified file content (${wordCount} words).*`;
    } else if (qLower.includes('explain')) {
      answer = `**Document Explanation for "${file.filename}"**:\n\n` +
        `This file is a ${inferFileType(file.mimeType, file.filename)} containing ${wordCount} words and ${lineCount} lines.\n\n` +
        `**Overview**:\n${textContent.slice(0, 400)}...\n\n` +
        `**Structure**: Composed of ${lineCount} lines with detailed structural content.`;
    } else {
      const sentences = textContent.split(/(?<=[.?!])\s+/);
      const relevant = sentences.filter((s) => {
        const words = qLower.split(' ').filter((w) => w.length > 3);
        return words.some((w) => s.toLowerCase().includes(w));
      });
      if (relevant.length > 0) {
        answer = `**Answer from "${file.filename}"**:\n\n` +
          relevant.slice(0, 3).join(' ') +
          `\n\n*(Matched relevant sections in document based on your question)*`;
      } else {
        answer = `**Analysis of "${file.filename}"** for query: *"${question}"*:\n\n` +
          `The document (${file.filename}, ${formatBytes(file.size)}, ${wordCount} words) covers the following initial content:\n\n` +
          `> ${textContent.slice(0, 300)}...\n\n` +
          `You can also use the Editor or Preview modal to inspect the entire text.`;
      }
    }

    return {
      fileId,
      filename: file.filename,
      question,
      answer,
      metrics: {
        words: wordCount,
        lines: lineCount,
        characters: charCount,
        size: file.size,
        sizeStr: formatBytes(file.size),
        type: inferFileType(file.mimeType, file.filename),
      },
    };
  }
}

export const uploadService = new UploadService();

