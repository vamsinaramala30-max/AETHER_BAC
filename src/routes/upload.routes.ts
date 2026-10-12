import { Router } from 'express';
import { uploadController } from '../modules/upload/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import { uploadRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.use(authenticate);

// ── Root & Static Collections ────────────────────────────────────────────────
router.get('/', uploadController.listFiles);
router.get('/recent', uploadController.getRecentFiles);
router.get('/trash', uploadController.getTrashFiles);
router.post('/empty-trash', uploadController.emptyTrash);
router.get('/storage-insights', uploadController.getStorageInsights);
router.get('/duplicates', uploadController.getDuplicateFiles);

// ── Folder Endpoints ─────────────────────────────────────────────────────────
router.get('/folders', uploadController.listFolders);
router.post('/folders', uploadController.createFolder);
router.patch('/folders/:folderId', uploadController.renameFolder);
router.delete('/folders/:folderId', uploadController.deleteFolder);
router.get('/folders/:folderId/breadcrumbs', uploadController.getFolderBreadcrumbs);

// ── File Creation & Uploads ──────────────────────────────────────────────────
router.post('/single', uploadRateLimiter, upload.single('file'), uploadController.uploadSingle);
router.post('/multiple', uploadRateLimiter, upload.array('files', 50), uploadController.uploadMultiple);
router.post('/create-file', uploadController.createEmptyFile);

// ── File Specific Actions ────────────────────────────────────────────────────
router.post('/:id/trash', uploadController.moveToTrash);
router.post('/:uploadId/trash', uploadController.moveToTrash);
router.post('/:id/restore', uploadController.restoreFromTrash);
router.post('/:uploadId/restore', uploadController.restoreFromTrash);
router.delete('/:id/permanent', uploadController.permanentDelete);
router.delete('/:uploadId/permanent', uploadController.permanentDelete);
router.patch('/:id/move', uploadController.moveFile);
router.patch('/:uploadId/move', uploadController.moveFile);
router.post('/:id/copy', uploadController.copyFile);
router.post('/:uploadId/copy', uploadController.copyFile);
router.post('/:id/ask-ai', uploadController.askAIAboutFile);
router.post('/:uploadId/ask-ai', uploadController.askAIAboutFile);

// ── Existing Endpoints (Preserved for 100% Backward Compatibility) ───────────
router.get('/:id/download', uploadController.downloadFile);
router.get('/:uploadId/download', uploadController.downloadFile);
router.get('/:id/preview', uploadController.previewFile);
router.get('/:uploadId/preview', uploadController.previewFile);
router.put('/:id/content', uploadController.updateFileContent);
router.put('/:uploadId/content', uploadController.updateFileContent);
router.post('/:id/extract-text', uploadController.extractText);
router.post('/:uploadId/extract-text', uploadController.extractText);
router.get('/:id/versions', uploadController.getFileVersions);
router.get('/:uploadId/versions', uploadController.getFileVersions);
router.post('/:id/versions/:versionId/restore', uploadController.restoreFileVersion);
router.post('/:uploadId/versions/:versionId/restore', uploadController.restoreFileVersion);
router.get('/:id', uploadController.getFileInfo);
router.get('/:uploadId', uploadController.getFileInfo);
router.patch('/:id', uploadController.renameFile);
router.delete('/:id', uploadController.deleteFile);

export const uploadRoutes: Router = router;
