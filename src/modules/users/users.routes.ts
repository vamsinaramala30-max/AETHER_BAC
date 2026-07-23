import { Router } from 'express';
import { usersController } from './users.controller';
import { validate } from '../../middleware/validation.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { updateUserSchema } from './users.validator';

const router = Router();

router.use(authenticate);
router.get('/', usersController.getUsers);
router.get('/:id', usersController.getUserById);
router.put('/:id', validate(updateUserSchema), usersController.updateUser);
router.delete('/:id', usersController.deleteUser);

export const usersModuleRoutes = router;