import { PrismaClient, FileStatus } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { logger } from '../../config';

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export class UploadService {
  public async handleSingleUpload(file: Express.Multer.File, userId?: string): Promise<any> {
    logger.info(`Processing file upload: ${file.originalname}`);

    // If userId not given, default or lookup first user
    let ownerId = userId;
    if (!ownerId) {
      const firstUser = await prisma.user.findFirst();
      if (firstUser) {
        ownerId = firstUser.id;
      }
    }

    const fileExt = path.extname(file.originalname);
    const fileNameOnDisk = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${fileExt}`;
    const storagePath = path.join(UPLOAD_DIR, fileNameOnDisk);

    // Save buffer or move file to uploads dir
    if (file.buffer) {
      fs.writeFileSync(storagePath, file.buffer);
    } else if (file.path && fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, storagePath);
    }

    const savedFile = ownerId
      ? await prisma.file.create({
          data: {
            filename: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream',
            size: file.size,
            storagePath: fileNameOnDisk,
            status: FileStatus.READY,
            userId: ownerId,
          },
        })
      : {
          id: `file_${Date.now()}`,
          filename: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          storagePath: fileNameOnDisk,
          status: 'READY',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

    return savedFile;
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
    if (query.userId) {
      where.userId = query.userId;
    }

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.file.count({ where }),
    ]);

    return {
      files,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async deleteFile(id: string) {
    const existing = await prisma.file.findUnique({ where: { id } });
    if (existing) {
      const fullPath = path.join(UPLOAD_DIR, existing.storagePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      await prisma.file.delete({ where: { id } });
    }
    return { success: true };
  }

  public async renameFile(id: string, newName: string) {
    return prisma.file.update({
      where: { id },
      data: { filename: newName },
    });
  }

  public async getFileById(id: string) {
    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return null;
    const fullPath = path.join(UPLOAD_DIR, file.storagePath);
    return { ...file, fullPath };
  }
}
