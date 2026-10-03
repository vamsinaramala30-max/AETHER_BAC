import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { UploadService } from './upload.service';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../config';

const uploadService = new UploadService();

const PREVIEW_SUPPORTED_EXTENSIONS = new Set([
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  // Document
  '.pdf',
  // Video
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  // Audio
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.aac',
  // Text & Code
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.htm',
  '.css',
  '.csv',
  '.py',
  '.sh',
  '.yaml',
  '.yml',
  '.xml',
  '.log',
  '.env',
  '.sql',
]);

function isSupportedPreview(mimeType: string, filename: string): boolean {
  const m = (mimeType || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (
    m.startsWith('image/') ||
    m === 'application/pdf' ||
    m.startsWith('video/') ||
    m.startsWith('audio/') ||
    m.startsWith('text/') ||
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'application/javascript' ||
    m === 'application/x-javascript'
  ) {
    return true;
  }
  const ext = path.extname(f);
  return PREVIEW_SUPPORTED_EXTENSIONS.has(ext);
}

export class UploadController {
  public async uploadSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No upload file provided', 400, 'FILE_MISSING');
      }
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        (req.body?.workspaceId as string) ||
        (req as any).user?.workspaceId ||
        (req.headers['x-workspace-id'] as string);
      const result = await uploadService.handleSingleUpload(req.file, userId, workspaceId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async uploadMultiple(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw new AppError('No upload files provided', 400, 'FILES_MISSING');
      }
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        (req.body?.workspaceId as string) ||
        (req as any).user?.workspaceId ||
        (req.headers['x-workspace-id'] as string);
      const result = await uploadService.handleMultipleUploads(files, userId, workspaceId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async listFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query.search as string;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        (req.query.workspaceId as string) ||
        (req as any).user?.workspaceId ||
        (req.headers['x-workspace-id'] as string);

      const data = await uploadService.listFiles({ search, page, limit, userId, workspaceId });
      res.status(200).json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  public async deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      await uploadService.deleteFile(id, userId);
      res.status(200).json({ success: true, message: 'File deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  public async renameFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { filename } = req.body;
      if (!filename) {
        throw new AppError('New filename required', 400, 'FILENAME_REQUIRED');
      }
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const updated = await uploadService.renameFile(id, filename, userId);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  public async previewFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (req.params.uploadId || req.params.id) as string;
      const userId = (req as any).user?.id || (req as any).user?.userId;

      if (!id) {
        throw new AppError('Upload ID required', 400, 'INVALID_UPLOAD_ID');
      }
      if (!userId) {
        throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      }

      const fileRecord = await uploadService.getFileById(id, userId);
      if (!fileRecord) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      const mimeType = fileRecord.mimeType || 'application/octet-stream';
      if (!isSupportedPreview(mimeType, fileRecord.filename)) {
        res.status(415).json({
          success: false,
          error: {
            code: 'PREVIEW_UNSUPPORTED',
            message: `Preview is not supported for file type "${mimeType}". Please download the file to view it.`,
          },
        });
        return;
      }

      const fileData = await uploadService.getFileStreamOrBuffer(fileRecord);
      if (!fileData.fullPath && !fileData.buffer) {
        logger.warn(`Preview file missing in storage for upload record ${id}`);
        throw new AppError('The requested file is not available in storage', 404, 'FILE_NOT_FOUND');
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(fileRecord.filename)}"`,
      );

      if (fileData.buffer) {
        res.setHeader('Content-Length', fileData.buffer.length);
        res.status(200).send(fileData.buffer);
        return;
      }

      if (fileData.fullPath) {
        const stream = fs.createReadStream(fileData.fullPath);
        stream.on('error', (err) => {
          logger.error('Stream read error during file preview:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: {
                code: 'STREAM_ERROR',
                message: 'Failed to read file contents from storage.',
              },
            });
          }
        });
        stream.pipe(res);
      }
    } catch (err) {
      next(err);
    }
  }

  public async downloadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (req.params.uploadId || req.params.id) as string;
      const inline = req.query.inline === 'true';
      const userId = (req as any).user?.id || (req as any).user?.userId;

      if (!id) {
        throw new AppError('Upload ID required', 400, 'INVALID_UPLOAD_ID');
      }
      if (!userId) {
        throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      }

      const fileRecord = await uploadService.getFileById(id, userId);
      if (!fileRecord) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      const fileData = await uploadService.getFileStreamOrBuffer(fileRecord);
      if (!fileData.fullPath && !fileData.buffer) {
        logger.warn(`Download file missing in storage for upload record ${id}`);
        throw new AppError('The requested file is not available in storage', 404, 'FILE_NOT_FOUND');
      }

      const mimeType = fileRecord.mimeType || 'application/octet-stream';
      const dispositionType = inline ? 'inline' : 'attachment';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename="${encodeURIComponent(fileRecord.filename)}"`,
      );

      if (fileData.buffer) {
        res.setHeader('Content-Length', fileData.buffer.length);
        res.status(200).send(fileData.buffer);
        return;
      }

      if (fileData.fullPath) {
        const stream = fs.createReadStream(fileData.fullPath);
        stream.on('error', (err) => {
          logger.error('Stream read error during file download:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: {
                code: 'STREAM_ERROR',
                message: 'Failed to read file contents from storage.',
              },
            });
          }
        });
        stream.pipe(res);
      }
    } catch (err) {
      next(err);
    }
  }
}

export const uploadController = new UploadController();
