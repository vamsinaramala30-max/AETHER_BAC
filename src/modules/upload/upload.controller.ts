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
  '.flac',
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
  '.tsv',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.php',
  '.sh',
  '.bash',
  '.yaml',
  '.yml',
  '.xml',
  '.log',
  '.env',
  '.sql',
  '.toml',
  '.ini',
  '.conf',
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
    m === 'application/x-javascript' ||
    m === 'application/typescript' ||
    m === 'application/sql' ||
    m === 'application/x-yaml'
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
      const rawWorkspaceId =
        (req.body?.workspaceId as string) ||
        (req as any).user?.workspaceId ||
        (req.headers?.['x-workspace-id'] as string);
      const cleanWorkspaceId =
        rawWorkspaceId && typeof rawWorkspaceId === 'string' && rawWorkspaceId.trim() !== ''
          ? rawWorkspaceId.trim()
          : null;
      const rawProjectId =
        (req.body?.projectId as string) ||
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string);
      const cleanProjectId =
        rawProjectId && typeof rawProjectId === 'string' && rawProjectId.trim() !== ''
          ? rawProjectId.trim()
          : null;
      const rawFolderId =
        (req.body?.folderId as string) ||
        (req.query?.folderId as string) ||
        (req.headers?.['x-folder-id'] as string);
      const cleanFolderId =
        rawFolderId && typeof rawFolderId === 'string' && rawFolderId.trim() !== ''
          ? rawFolderId.trim()
          : null;
      const result = await uploadService.handleSingleUpload(
        req.file,
        userId,
        cleanWorkspaceId,
        cleanProjectId,
        cleanFolderId,
      );
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
      const rawWorkspaceId =
        (req.body?.workspaceId as string) ||
        (req as any).user?.workspaceId ||
        (req.headers?.['x-workspace-id'] as string);
      const cleanWorkspaceId =
        rawWorkspaceId && typeof rawWorkspaceId === 'string' && rawWorkspaceId.trim() !== ''
          ? rawWorkspaceId.trim()
          : null;
      const rawProjectId =
        (req.body?.projectId as string) ||
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string);
      const cleanProjectId =
        rawProjectId && typeof rawProjectId === 'string' && rawProjectId.trim() !== ''
          ? rawProjectId.trim()
          : null;
      const rawFolderId =
        (req.body?.folderId as string) ||
        (req.query?.folderId as string) ||
        (req.headers?.['x-folder-id'] as string);
      const cleanFolderId =
        rawFolderId && typeof rawFolderId === 'string' && rawFolderId.trim() !== ''
          ? rawFolderId.trim()
          : null;
      const result = await uploadService.handleMultipleUploads(
        files,
        userId,
        cleanWorkspaceId,
        cleanProjectId,
        cleanFolderId,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public async listFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = req.query?.search as string;
      const page = req.query?.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query?.limit ? parseInt(req.query.limit as string, 10) : 20;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        typeof req.query?.workspaceId === 'string' && req.query.workspaceId.trim() !== ''
          ? req.query.workspaceId.trim()
          : undefined;
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const hasProject = req.query?.hasProject === 'true';
      const folderId = req.query?.folderId !== undefined ? (req.query.folderId as string) : undefined;
      const category = req.query?.category as string | undefined;
      const favoriteOnly = req.query?.favoriteOnly === 'true';
      const includeTrash = req.query?.includeTrash === 'true' || req.query?.trash === 'true';

      const data = await uploadService.listFiles({
        search,
        page,
        limit,
        userId,
        workspaceId,
        projectId,
        hasProject,
        folderId,
        category,
        favoriteOnly,
        includeTrash,
      });
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
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req.headers?.['x-workspace-id'] as string) ||
        undefined;

      if (!id) {
        throw new AppError('Upload ID required', 400, 'INVALID_UPLOAD_ID');
      }
      if (!userId) {
        throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      }

      const fileRecord = await uploadService.getFileById(id, userId, projectId, workspaceId);
      if (!fileRecord) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      const mimeType = fileRecord.mimeType || 'application/octet-stream';
      const isRawRequested = req.query?.raw === 'true';
      const isInspectRequested = req.query?.inspect === 'true';

      // Archive inspection request: Return structured archive hierarchy
      const isArchiveMime =
        mimeType.includes('zip') ||
        mimeType.includes('compressed') ||
        mimeType.includes('tar') ||
        mimeType.includes('gzip') ||
        /\.(zip|tar|gz|7z|rar)$/i.test(fileRecord.filename);

      if (isInspectRequested || (isArchiveMime && req.query?.format === 'json')) {
        const archiveData = await uploadService.inspectArchive(fileRecord);
        res.status(200).json({ success: true, data: archiveData });
        return;
      }

      // Office Document Text Extraction — DOCX, XLSX, PPTX, DOC, XLS, PPT
      const isOfficeMime =
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.ms-excel' ||
        mimeType === 'application/vnd.ms-powerpoint';
      const isOfficeExtension = /\.(docx|xlsx|pptx|doc|xls|ppt)$/i.test(fileRecord.filename);

      if ((isOfficeMime || isOfficeExtension) && !isRawRequested) {
        try {
          const extracted = await uploadService.extractText(id, userId, projectId, workspaceId);
          if (extracted && extracted.text && extracted.text.trim().length > 0) {
            // Successful extraction — return as plain text preview
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader(
              'Content-Disposition',
              `inline; filename="${encodeURIComponent(fileRecord.filename)}.txt"`,
            );
            res.status(200).send(extracted.text);
            return;
          }
          res.status(422).json({
            success: false,
            error: {
              code: 'EXTRACTION_FAILED',
              message: 'Office document contains no extractable text',
            },
          });
          return;
        } catch (err: any) {
          const errMsg = err?.message || '';
          if (errMsg.includes('not a valid OOXML/ZIP') || errMsg.toLowerCase().includes('corrupt')) {
            res.status(422).json({
              success: false,
              error: {
                code: 'DOCUMENT_CORRUPT',
                message: `Office document is corrupt or invalid: ${errMsg}`,
              },
            });
            return;
          }
          res.status(422).json({
            success: false,
            error: {
              code: 'EXTRACTION_FAILED',
              message: errMsg || 'Office document extraction failed',
            },
          });
          return;
        }
      }

      if (!isSupportedPreview(mimeType, fileRecord.filename) && !isRawRequested) {
        res.status(415).json({
          success: false,
          error: {
            code: 'PREVIEW_UNSUPPORTED',
            message: `Preview is not supported for ${fileRecord.filename}. Please download the file to view it.`,
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
      const inline = req.query?.inline === 'true';
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req.headers?.['x-workspace-id'] as string) ||
        undefined;

      if (!id) {
        throw new AppError('Upload ID required', 400, 'INVALID_UPLOAD_ID');
      }
      if (!userId) {
        throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      }

      const fileRecord = await uploadService.getFileById(id, userId, projectId, workspaceId);
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

  public async getFileInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (req.params.uploadId || req.params.id) as string;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req.headers?.['x-workspace-id'] as string) ||
        undefined;

      if (!id) {
        throw new AppError('Upload ID required', 400, 'INVALID_UPLOAD_ID');
      }
      if (!userId) {
        throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
      }

      const fileRecord = await uploadService.getFileById(id, userId, projectId, workspaceId);
      if (!fileRecord) {
        throw new AppError('File not found', 404, 'FILE_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: {
          id: fileRecord.id,
          filename: fileRecord.filename,
          mimeType: fileRecord.mimeType,
          size: fileRecord.size,
          status: fileRecord.status,
          createdAt: fileRecord.createdAt,
          updatedAt: fileRecord.updatedAt,
          userId: fileRecord.userId,
          workspaceId: fileRecord.workspaceId,
          projectId: fileRecord.projectId,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateFileContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (req.params.uploadId || req.params.id) as string;
      const { content, comment } = req.body;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const projectId =
        (req.query?.projectId as string) ||
        (req.body?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req.body?.workspaceId as string) ||
        (req.headers?.['x-workspace-id'] as string) ||
        undefined;

      if (!id) {
        throw new AppError('File ID required', 400, 'FILE_ID_REQUIRED');
      }
      if (typeof content !== 'string') {
        throw new AppError('Content string is required', 400, 'CONTENT_REQUIRED');
      }

      const result = await uploadService.updateFileContent(
        id,
        content,
        userId,
        comment,
        projectId,
        workspaceId,
      );
      res.status(200).json({
        success: true,
        message: 'File content saved successfully',
        data: result.file,
        version: result.version,
      });
    } catch (err) {
      next(err);
    }
  }

  public async extractText(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (req.params.uploadId || req.params.id) as string;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req.headers?.['x-workspace-id'] as string) ||
        undefined;

      if (!id) {
        throw new AppError('File ID required', 400, 'FILE_ID_REQUIRED');
      }

      const extracted = await uploadService.extractText(id, userId, projectId, workspaceId);
      res.status(200).json({
        success: true,
        data: extracted,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getRecentFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        typeof req.query?.workspaceId === 'string' && req.query.workspaceId.trim() !== ''
          ? req.query.workspaceId.trim()
          : undefined;
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const limit = req.query?.limit ? parseInt(req.query.limit as string, 10) : 10;

      const recentFiles = await uploadService.getRecentFiles({
        userId,
        workspaceId,
        projectId,
        limit,
      });

      res.status(200).json({
        success: true,
        data: recentFiles,
      });
    } catch (err) {
      next(err);
    }
  }

  public async getFileVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (req.params.uploadId || req.params.id) as string;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req.headers?.['x-workspace-id'] as string) ||
        undefined;

      if (!id) {
        throw new AppError('File ID required', 400, 'FILE_ID_REQUIRED');
      }

      const versions = await uploadService.getFileVersions(id, userId, projectId, workspaceId);
      res.status(200).json({
        success: true,
        data: versions,
      });
    } catch (err) {
      next(err);
    }
  }

  public async restoreFileVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = (req.params.uploadId || req.params.id) as string;
      const versionId = req.params.versionId as string;
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const projectId =
        (req.query?.projectId as string) ||
        (req.headers?.['x-project-id'] as string) ||
        undefined;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req.headers?.['x-workspace-id'] as string) ||
        undefined;

      if (!id || !versionId) {
        throw new AppError('File ID and Version ID are required', 400, 'PARAMS_REQUIRED');
      }

      const result = await uploadService.restoreFileVersion(
        id,
        versionId,
        userId,
        projectId,
        workspaceId,
      );
      res.status(200).json({
        success: true,
        message: 'File restored successfully to target version',
        data: result.file,
        version: result.version,
      });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // FOLDERS
  // ==========================================================================

  public async listFolders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req as any).user?.workspaceId ||
        (req.headers?.['x-workspace-id'] as string);
      const parentId = req.query?.parentId !== undefined ? (req.query.parentId as string) : undefined;
      const projectId = (req.query?.projectId as string) || undefined;

      const folders = await uploadService.listFolders({ userId, workspaceId, parentId, projectId });
      res.status(200).json({ success: true, data: folders });
    } catch (err) {
      next(err);
    }
  }

  public async createFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const { name, parentId, workspaceId: bodyWs } = req.body || {};
      const workspaceId =
        bodyWs ||
        (req as any).user?.workspaceId ||
        (req.headers?.['x-workspace-id'] as string);

      const folder = await uploadService.createFolder({ userId, name, parentId, workspaceId });
      res.status(201).json({ success: true, data: folder });
    } catch (err) {
      next(err);
    }
  }

  public async renameFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const folderId = req.params.folderId || req.params.id;
      const { name } = req.body || {};

      const folder = await uploadService.renameFolder(folderId, name, userId);
      res.status(200).json({ success: true, data: folder });
    } catch (err) {
      next(err);
    }
  }

  public async deleteFolder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const folderId = req.params.folderId || req.params.id;

      const result = await uploadService.deleteFolder(folderId, userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getFolderBreadcrumbs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const folderId = req.params.folderId || req.params.id;

      const breadcrumbs = await uploadService.getFolderBreadcrumbs(folderId, userId);
      res.status(200).json({ success: true, data: breadcrumbs });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // FILE ACTIONS: MOVE, COPY, CREATE EMPTY
  // ==========================================================================

  public async moveFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const id = req.params.id || req.params.uploadId;
      const { folderId, projectId } = req.body || {};

      const updated = await uploadService.moveFile(id, userId, folderId, projectId);
      res.status(200).json({ success: true, data: updated, message: 'File moved successfully' });
    } catch (err) {
      next(err);
    }
  }

  public async copyFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const id = req.params.id || req.params.uploadId;
      const { targetFolderId } = req.body || {};

      const copy = await uploadService.copyFile(id, userId, targetFolderId);
      res.status(201).json({ success: true, data: copy, message: 'File duplicated successfully' });
    } catch (err) {
      next(err);
    }
  }

  public async createEmptyFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const { filename, content, folderId, workspaceId, projectId } = req.body || {};

      const newFile = await uploadService.createEmptyFile({
        userId,
        filename,
        content,
        folderId,
        workspaceId,
        projectId,
      });
      res.status(201).json({ success: true, data: newFile, message: 'File created successfully' });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // TRASH LIFECYCLE
  // ==========================================================================

  public async moveToTrash(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const id = req.params.id || req.params.uploadId;

      const file = await uploadService.moveToTrash(id, userId);
      res.status(200).json({ success: true, data: file, message: 'File moved to Trash' });
    } catch (err) {
      next(err);
    }
  }

  public async restoreFromTrash(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const id = req.params.id || req.params.uploadId;

      const file = await uploadService.restoreFromTrash(id, userId);
      res.status(200).json({ success: true, data: file, message: 'File restored from Trash' });
    } catch (err) {
      next(err);
    }
  }

  public async getTrashFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        typeof req.query?.workspaceId === 'string' && req.query.workspaceId.trim() !== ''
          ? req.query.workspaceId.trim()
          : undefined;

      const files = await uploadService.getTrashFiles({ userId, workspaceId });
      res.status(200).json({ success: true, data: files });
    } catch (err) {
      next(err);
    }
  }

  public async emptyTrash(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        typeof req.query?.workspaceId === 'string' && req.query.workspaceId.trim() !== ''
          ? req.query.workspaceId.trim()
          : undefined;

      const result = await uploadService.emptyTrash({ userId, workspaceId });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  public async permanentDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const id = req.params.id || req.params.uploadId;

      await uploadService.deleteFile(id, userId);
      res.status(200).json({ success: true, message: 'File permanently deleted' });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // STORAGE INSIGHTS & DUPLICATES
  // ==========================================================================

  public async getStorageInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        typeof req.query?.workspaceId === 'string' && req.query.workspaceId.trim() !== ''
          ? req.query.workspaceId.trim()
          : undefined;
      const projectId = (req.query?.projectId as string) || undefined;

      const insights = await uploadService.getStorageInsights({ userId, workspaceId, projectId });
      res.status(200).json({ success: true, data: insights });
    } catch (err) {
      next(err);
    }
  }

  public async getDuplicateFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const workspaceId =
        (req.query?.workspaceId as string) ||
        (req as any).user?.workspaceId ||
        (req.headers?.['x-workspace-id'] as string);
      const projectId = (req.query?.projectId as string) || undefined;

      const duplicates = await uploadService.getDuplicateFiles({ userId, workspaceId, projectId });
      res.status(200).json({ success: true, data: duplicates });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // ASK AI ABOUT FILE
  // ==========================================================================

  public async askAIAboutFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user?.id || (req as any).user?.userId;
      const id = req.params.id || req.params.uploadId;
      const { question } = req.body || {};
      const projectId = (req.query?.projectId as string) || (req.body?.projectId as string) || undefined;
      const workspaceId = (req.query?.workspaceId as string) || (req.body?.workspaceId as string) || undefined;

      if (!question || typeof question !== 'string' || !question.trim()) {
        throw new AppError('Question string is required', 400, 'QUESTION_REQUIRED');
      }

      const analysis = await uploadService.askAIAboutFile(id, userId, question.trim(), projectId, workspaceId);
      res.status(200).json({ success: true, data: analysis });
    } catch (err) {
      next(err);
    }
  }
}

export const uploadController = new UploadController();
