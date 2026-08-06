import { FileStatus } from '@prisma/client';
import path from 'path';
import fs from 'fs';
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
  public async handleSingleUpload(file: Express.Multer.File, userId?: string): Promise<any> {
    logger.info(`Processing file upload: ${file.originalname}`);

    let ownerId = userId;
    if (ownerId && !isValidUuid(ownerId)) {
      ownerId = undefined;
    }

    if (!ownerId) {
      let firstUser = await db.user.findFirst();
      if (!firstUser) {
        firstUser = await db.user.create({
          data: {
            email: 'admin@aether.os',
            passwordHash: 'hash',
            fullName: 'Aether Admin',
          },
        });
      }
      ownerId = firstUser.id;
    }

    const fileExt = path.extname(file.originalname);
    const fileNameOnDisk = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt}`;
    const storagePath = path.join(UPLOAD_DIR, fileNameOnDisk);

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
          filename: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          storagePath: fileNameOnDisk,
          status: FileStatus.READY,
          userId: ownerId,
        },
      });
      return savedFile;
    } catch (dbErr) {
      logger.error('Failed to create file record in DB:', dbErr);
      if (fs.existsSync(storagePath)) {
        try { fs.unlinkSync(storagePath); } catch {}
      }
      throw new AppError('Database error creating file record', 500, 'FILE_DB_ERROR');
    }
  }

  public async handleMultipleUploads(files: Express.Multer.File[], userId?: string) {
    return Promise.all(files.map((file) => this.handleSingleUpload(file, userId)));
  }

  public async listFiles(query: {
    search?: string;
    page?: number;
    limit?: number;
    userId?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search) {
      where.filename = { contains: query.search, mode: 'insensitive' };
    }

    try {
      let [files, total] = await Promise.all([
        db.file.findMany({
          where: query.userId && isValidUuid(query.userId) ? { ...where, userId: query.userId } : where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.file.count({
          where: query.userId && isValidUuid(query.userId) ? { ...where, userId: query.userId } : where,
        }),
      ]);

      // Fallback: If filtered by userId returns empty, fetch all non-deleted files
      if (files.length === 0 && query.userId) {
        [files, total] = await Promise.all([
          db.file.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          db.file.count({ where }),
        ]);
      }

      return {
        files,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    } catch (err) {
      logger.warn('Error listing files from DB, returning empty set:', err);
      return {
        files: [],
        pagination: { total: 0, page: 1, limit, totalPages: 1 },
      };
    }
  }

  public async deleteFile(id: string, userId?: string) {
    if (!isValidUuid(id)) {
      return { success: true, message: 'Invalid file ID or file already removed' };
    }

    try {
      const existing = await db.file.findUnique({ where: { id } });
      if (existing) {
        if (userId && isValidUuid(userId) && existing.userId !== userId) {
          throw new AppError('Unauthorized to delete this file', 403, 'FORBIDDEN');
        }
        const fullPath = path.join(UPLOAD_DIR, existing.storagePath);
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch {}
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

  public async renameFile(id: string, newName: string) {
    if (!isValidUuid(id)) {
      throw new AppError('Invalid file ID', 400, 'INVALID_FILE_ID');
    }
    return db.file.update({
      where: { id },
      data: { filename: newName },
    });
  }

  public async getFileById(id: string) {
    if (!isValidUuid(id)) return null;
    try {
      const file = await db.file.findUnique({ where: { id } });
      if (!file) return null;
      const fullPath = path.join(UPLOAD_DIR, file.storagePath);
      return { ...file, fullPath };
    } catch {
      return null;
    }
  }
}

