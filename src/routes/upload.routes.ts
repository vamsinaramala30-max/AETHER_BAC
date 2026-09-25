import { Router } from 'express';
import { uploadController } from '../modules/upload/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import { uploadRateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.use(authenticate);

router.get('/', uploadController.listFiles);
router.post('/single', uploadRateLimiter, upload.single('file'), uploadController.uploadSingle);
router.post('/multiple', uploadRateLimiter, upload.array('files', 5), uploadController.uploadMultiple);
router.get('/:id/download', uploadController.downloadFile);
router.get('/:id/preview', (req, res, next) => {
  req.query.inline = 'true';
  return uploadController.downloadFile(req, res, next);
});
router.patch('/:id', uploadController.renameFile);
router.delete('/:id', uploadController.deleteFile);

export const uploadRoutes: Router = router;

