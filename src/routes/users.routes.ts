import { Router } from 'express';
import { usersController } from '../modules/users/users.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { updateUserSchema } from '../validators/user.validator';

const router = Router();

router.use(authenticate);

router.get('/connected-accounts', usersController.getConnectedAccounts);
router.delete('/connected-accounts/:provider', usersController.disconnectAccount);

router.get('/preferences', usersController.getPreferences);
router.put('/preferences', usersController.updatePreferences);
router.patch('/preferences', usersController.updatePreferences);

router.get('/settings/notifications', usersController.getNotificationSettings);
router.put('/settings/notifications', usersController.updateNotificationSettings);
router.patch('/settings/notifications', usersController.updateNotificationSettings);

router.get('/', usersController.getUsers);
router.get('/:id', usersController.getUserById);
router.put('/:id', validate(updateUserSchema), usersController.updateUser);
router.delete('/:id', usersController.deleteUser);

export const usersRoutes: Router = router;
