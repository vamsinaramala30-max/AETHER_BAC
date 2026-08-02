import { Router } from 'express';
import { uploadController } from '../modules/upload/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Allow authenticated requests (and optional unauthenticated access if middleware handles it)
router.use((req, res, next) => {
  if (req.headers.authorization) {
    return authenticate(req, res, next);
  }
  next();
});

router.get('/', uploadController.listFiles);
router.post('/single', upload.single('file'), uploadController.uploadSingle);
router.post('/multiple', upload.array('files', 5), uploadController.uploadMultiple);
router.get('/:id/download', uploadController.downloadFile);
router.patch('/:id', uploadController.renameFile);
router.delete('/:id', uploadController.deleteFile);

export const uploadRoutes: Router = router;
