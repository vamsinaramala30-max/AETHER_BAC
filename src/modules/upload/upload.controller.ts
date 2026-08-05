import { Request, Response, NextFunction } from 'express';
import { UploadService } from './upload.service';
import { AppError } from '../../middleware/error.middleware';
import fs from 'fs';

const uploadService = new UploadService();

export class UploadController {
  public async uploadSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No upload file provided', 400, 'FILE_MISSING');
      }
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const result = await uploadService.handleSingleUpload(req.file, userId);
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
      const result = await uploadService.handleMultipleUploads(files, userId);
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

      const data = await uploadService.listFiles({ search, page, limit, userId });
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
      const updated = await uploadService.renameFile(id, filename);
      res.status(200).json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  public async downloadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const fileRecord = await uploadService.getFileById(id);
      if (!fileRecord || !fileRecord.fullPath || !fs.existsSync(fileRecord.fullPath)) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }
      res.setHeader('Content-Type', fileRecord.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileRecord.filename}"`);
      fs.createReadStream(fileRecord.fullPath).pipe(res);
    } catch (err) {
      next(err);
    }
  }
}

export const uploadController = new UploadController();
