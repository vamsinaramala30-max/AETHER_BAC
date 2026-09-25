import { FileStatus } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { logger } from '../../config';
import { db } from '../../database/client';
import { AppError } from '../../middleware/error.middleware';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const isValidUuid = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export class UploadService {
  public async handleSingleUpload(
    file: Express.Multer.File,
    userId?: string,
    workspaceId?: string,
  ): Promise<any> {
    logger.info(`Processing file upload: ${file.originalname}`);

    if (!file || file.size === 0 || (!file.buffer && !file.path) || (file.buffer && file.buffer.length === 0)) {
      throw new AppError('Cannot upload empty or invalid file', 400, 'EMPTY_FILE');
    }

    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required for upload', 401, 'UNAUTHORIZED');
    }

    if (workspaceId) {
      if (!isValidUuid(workspaceId)) {
        throw new AppError('Invalid workspace ID format', 400, 'INVALID_WORKSPACE_ID');
      }
      const membership = await db.workspaceMember.findFirst({
        where: { workspaceId, userId },
      });
      if (!membership) {
        throw new AppError('Forbidden: you are not a member of this workspace', 403, 'FORBIDDEN');
      }
    }

    // Sanitize filename and prevent directory traversal
    const rawName = file.originalname || 'upload';
    const sanitizedOriginal = path.basename(rawName).replace(/[\0\r\n\t]/g, '').trim();
    if (!sanitizedOriginal || sanitizedOriginal === '.' || sanitizedOriginal === '..' || sanitizedOriginal.includes('/') || sanitizedOriginal.includes('\\')) {
      throw new AppError('Invalid filename or path traversal detected', 400, 'INVALID_FILENAME');
    }

    const rawExt = path.extname(sanitizedOriginal).toLowerCase();
    const safeExt = rawExt.replace(/[^a-z0-9.]/gi, '');
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

    try {
      const savedFile = await db.file.create({
        data: {
          filename: sanitizedOriginal,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          storagePath: fileNameOnDisk,
          status: FileStatus.READY,
          userId,
          workspaceId: workspaceId ?? null,
        },
      });
      return savedFile;
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
    workspaceId?: string,
  ) {
    return Promise.all(files.map((file) => this.handleSingleUpload(file, userId, workspaceId)));
  }

  public async listFiles(query: {
    search?: string;
    page?: number;
    limit?: number;
    userId?: string;
    workspaceId?: string;
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

    if (query.workspaceId && isValidUuid(query.workspaceId)) {
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

    try {
      const [files, total] = await Promise.all([
        db.file.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.file.count({ where }),
      ]);

      return {
        files,
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

  public async getFileById(id: string, userId?: string) {
    if (!isValidUuid(id)) return null;
    if (!userId || !isValidUuid(userId)) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }

    const file = await db.file.findUnique({ where: { id } });
    if (!file) return null;
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
    const safeBaseName = path.basename(file.storagePath);
    const fullPath = path.resolve(UPLOAD_DIR, safeBaseName);
    if (!fullPath.startsWith(path.resolve(UPLOAD_DIR))) {
      throw new AppError('Unauthorized path access', 403, 'FORBIDDEN');
    }
    return { ...file, fullPath };
  }
}
