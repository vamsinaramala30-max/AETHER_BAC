import { Request, Response, NextFunction } from 'express';
import { UploadService } from './upload.service';
import { AppError } from '../../middleware/error.middleware';

const uploadService = new UploadService();

export class UploadController {
  public async uploadSingle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No upload file provided', 400, 'FILE_MISSING');
      }
      const result = await uploadService.handleSingleUpload(req.file);
      res.status(200).json({ success: true, data: result });
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
      const result = await uploadService.handleMultipleUploads(files);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const uploadController = new UploadController();