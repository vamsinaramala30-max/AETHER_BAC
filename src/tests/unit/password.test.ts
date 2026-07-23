import { PasswordService } from '../../auth/password';

describe('PasswordService', () => {
  it('should correctly hash and compare a valid password', async () => {
    const rawPassword = 'SecurePassword123!';
    const hash = await PasswordService.hash(rawPassword);

    expect(hash).not.toEqual(rawPassword);

    const isValid = await PasswordService.compare(rawPassword, hash);
    expect(isValid).toBe(true);
  });

  it('should return false for invalid password comparison', async () => {
    const hash = await PasswordService.hash('CorrectPassword123!');
    const isValid = await PasswordService.compare('WrongPassword123!', hash);

    expect(isValid).toBe(false);
  });

  it('should enforce password strength validation rules', () => {
    expect(PasswordService.isStrongPassword('Weak1!')).toBe(false);
    expect(PasswordService.isStrongPassword('StrongPass123!')).toBe(true);
  });
});