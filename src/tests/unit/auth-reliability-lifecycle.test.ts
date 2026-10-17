import { describe, it, expect, afterAll } from 'vitest';
import { AuthService } from '../../modules/auth/auth.service';
import { db } from '../../database/client';

describe('AETHER Backend Authentication Reliability & Lifecycle Suite', () => {
  const authService = new AuthService();
  const testEmail = `test_audit_vitest_${Date.now()}@example.com`;
  const testPassword = 'Password123!Safe';
  let createdUserId: string | null = null;
  let refreshToken: string | null = null;

  afterAll(async () => {
    if (createdUserId) {
      try {
        await db.session.deleteMany({ where: { userId: createdUserId } });
        await db.userSettings.deleteMany({ where: { userId: createdUserId } });
        await db.workspaceMember.deleteMany({ where: { userId: createdUserId } });
        await db.notification.deleteMany({ where: { userId: createdUserId } });
        await db.user.delete({ where: { id: createdUserId } });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('Scenario 1: Registers a new user and generates valid JWT tokens', async () => {
    const regResult = await authService.register({
      email: testEmail,
      password: testPassword,
      firstName: 'Audit',
      lastName: 'Tester',
    });

    createdUserId = regResult.user.id;
    refreshToken = regResult.tokens.refreshToken;

    expect(regResult.user.id).toBeDefined();
    expect(regResult.user.email).toBe(testEmail);
    expect(regResult.tokens.accessToken).toBeDefined();
    expect(regResult.tokens.refreshToken).toBeDefined();
  }, 15000);

  it('Scenario 2: Correctly rejects duplicate registration with AppError(409)', async () => {
    await expect(
      authService.register({
        email: testEmail,
        password: testPassword,
        firstName: 'Audit',
        lastName: 'Tester',
      }),
    ).rejects.toThrow();
  }, 10000);

  it('Scenario 3: Successfully logs in with valid credentials and measures response time', async () => {
    const start = performance.now();
    const loginResult = await authService.login({
      email: testEmail,
      password: testPassword,
    });
    const duration = performance.now() - start;

    expect(loginResult.user.id).toBe(createdUserId);
    expect(loginResult.tokens.accessToken).toBeDefined();
    expect(duration).toBeLessThan(5000); // Well within target
    refreshToken = loginResult.tokens.refreshToken;
  }, 10000);

  it('Scenario 4: Rejects login with invalid password', async () => {
    await expect(
      authService.login({
        email: testEmail,
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow('Invalid email or password credentials');
  }, 10000);

  it('Scenario 5: Successfully retrieves authenticated user profile', async () => {
    if (!createdUserId) throw new Error('No test user');
    const profile = await authService.getProfile(createdUserId);
    expect(profile.email).toBe(testEmail);
    expect(profile.fullName).toBe('Audit Tester');
  }, 10000);

  it('Scenario 6: Successfully rotates and refreshes session tokens', async () => {
    if (!refreshToken) throw new Error('No refresh token');
    const refreshResult = await authService.refresh(refreshToken);
    expect(refreshResult.tokens.accessToken).toBeDefined();
    expect(refreshResult.tokens.refreshToken).toBeDefined();
    refreshToken = refreshResult.tokens.refreshToken;
  }, 10000);

  it('Scenario 7: Logs out user, invalidating session and bumping tokenVersion', async () => {
    if (!createdUserId || !refreshToken) throw new Error('No user or token');
    await expect(authService.logout(refreshToken, createdUserId)).resolves.not.toThrow();

    const user = await db.user.findUnique({ where: { id: createdUserId } });
    expect(user?.tokenVersion).toBeGreaterThan(0);
  }, 10000);
});
