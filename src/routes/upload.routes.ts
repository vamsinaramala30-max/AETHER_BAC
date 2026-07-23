import { Router } from 'express';
import { uploadController } from '../modules/upload/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.use(authenticate);

router.post('/single', upload.single('file'), uploadController.uploadSingle);
router.post('/multiple', upload.array('files', 5), uploadController.uploadMultiple);

export const uploadRoutes = router;