import { JWTService } from '../../auth/jwt';
import { Role } from '../../auth/role';

export const generateTestToken = (
  userId: string = 'test-user-id',
  email: string = 'test@example.com',
  role: Role = Role.MEMBER,
): string => {
  return JWTService.signAccessToken({
    id: userId,
    email,
    role,
  });
};
