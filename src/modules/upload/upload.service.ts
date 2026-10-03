import { FileStatus } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { logger, env } from '../../config';
import { db } from '../../database/client';
import { AppError } from '../../middleware/error.middleware';
import { StorageService } from '../../storage/StorageService';
import { documentParser } from '../ai/rag/ingestion/document-parser';

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

export class UploadService {
  private storageService: StorageService;

  constructor() {
    this.storageService = new StorageService();
  }

  public async handleSingleUpload(
    file: Express.Multer.File,
    userId?: string,
    workspaceId?: string | null,
    projectId?: string | null,
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

    // Persist via StorageService driver when configured (e.g. Supabase persistent cloud storage)
    try {
      if (env.STORAGE_DRIVER === 'supabase') {
        const buffer =
          file.buffer ||
          (file.path && fs.existsSync(file.path) ? fs.readFileSync(file.path) : null);
        if (buffer) {
          await this.storageService.upload(
            buffer,
            fileNameOnDisk,
            file.mimetype || 'application/octet-stream',
          );
        }
      }
    } catch (cloudErr) {
      logger.warn('StorageService cloud upload failed; local copy remains active:', cloudErr);
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
          workspaceId: cleanWorkspaceId,
          projectId: cleanProjectId,
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
    workspaceId?: string | null,
    projectId?: string | null,
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
      files.map((file) => this.handleSingleUpload(file, userId, cleanWorkspaceId, cleanProjectId)),
    );
  }

  public async listFiles(query: {
    search?: string;
    page?: number;
    limit?: number;
    userId?: string;
    workspaceId?: string;
    projectId?: string;
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

    if (query.projectId) {
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
    return { ...file, fullPath };
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
    const limit = Math.min(50, Math.max(1, query.limit || 10));

    const where: any = {};
    if (query.projectId) {
      if (!isValidUuid(query.projectId)) {
        throw new AppError('Invalid project ID format', 400, 'INVALID_PROJECT_ID');
      }
      where.projectId = query.projectId;
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
      orderBy: [
        { lastAccessedAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: limit,
    });

    return files.map((f) => ({
      id: f.id,
      name: f.filename,
      filename: f.filename,
      type: inferFileType(f.mimeType, f.filename),
      lastAccessed: (f.lastAccessedAt || f.updatedAt || f.createdAt).toISOString(),
      sizeStr: formatBytes(f.size),
      size: f.size,
      location: f.projectId ? 'Project Files' : 'Workspace Files',
      mimeType: f.mimeType,
      projectId: f.projectId,
      workspaceId: f.workspaceId,
      createdAt: f.createdAt.toISOString(),
    }));
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
      createdAt: v.createdAt.toISOString(),
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
}
