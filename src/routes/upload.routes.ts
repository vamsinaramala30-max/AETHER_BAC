import { Router } from 'express';
import { uploadController } from '../modules/upload/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import { uploadRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.use(authenticate);

router.get('/', uploadController.listFiles);
router.get('/recent', uploadController.getRecentFiles);
router.post('/single', uploadRateLimiter, upload.single('file'), uploadController.uploadSingle);
router.post('/multiple', uploadRateLimiter, upload.array('files', 5), uploadController.uploadMultiple);
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

