import { Router } from 'express';
import { usersController } from '../modules/users/users.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateUserSchema } from '../validators/user.validator';

const router = Router();

router.use(authenticate);

router.get('/', usersController.getUsers);
router.get('/:id', usersController.getUserById);
router.put('/:id', validate(updateUserSchema), usersController.updateUser);
router.delete('/:id', usersController.deleteUser);

export const usersRoutes = router;