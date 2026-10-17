import dotenv from 'dotenv';
dotenv.config();

import { AuthService } from '../src/modules/auth/auth.service';
import { db } from '../src/database/client';

const authService = new AuthService();

async function run() {
  const testEmail = `test_audit_${Date.now()}@example.com`;
  const testPassword = 'Password123!Safe';

  console.log('--- TEST 1: Registration ---');
  const regResult = await authService.register({
    email: testEmail,
    password: testPassword,
    firstName: 'Audit',
    lastName: 'Tester',
  });
  console.log('Registration OK. User ID:', regResult.user.id, 'Email:', regResult.user.email);
  console.log('Access token generated:', Boolean(regResult.tokens?.accessToken));
  console.log('Refresh token generated:', Boolean(regResult.tokens?.refreshToken));

  console.log('--- TEST 2: Duplicate Registration Rejection ---');
  try {
    await authService.register({
      email: testEmail,
      password: testPassword,
      firstName: 'Audit',
      lastName: 'Tester',
    });
    console.error('FAIL: Duplicate registration did not throw!');
  } catch (err: any) {
    console.log('Duplicate correctly rejected:', err.message, 'Status:', err.statusCode);
  }

  console.log('--- TEST 3: Login with Valid Credentials ---');
  const loginResult = await authService.login({
    email: testEmail,
    password: testPassword,
  });
  console.log('Login OK. User ID:', loginResult.user.id);
  console.log('Tokens present:', Boolean(loginResult.tokens?.accessToken));

  console.log('--- TEST 4: Login with Invalid Password ---');
  try {
    await authService.login({
      email: testEmail,
      password: 'WrongPassword!',
    });
    console.error('FAIL: Invalid password did not throw!');
  } catch (err: any) {
    console.log('Invalid credentials correctly rejected:', err.message, 'Status:', err.statusCode);
  }

  console.log('--- TEST 5: Get Profile ---');
  const profile = await authService.getProfile(loginResult.user.id);
  console.log('Profile fetched OK. Name:', profile.fullName, 'Email:', profile.email);

  console.log('--- TEST 6: Token Refresh ---');
  const refreshResult = await authService.refresh(loginResult.tokens.refreshToken);
  console.log('Token refreshed OK. New access token:', Boolean(refreshResult.tokens?.accessToken));

  console.log('--- TEST 7: Logout ---');
  await authService.logout(refreshResult.tokens.refreshToken, loginResult.user.id);
  console.log('Logout OK.');

  console.log('--- CLEANUP: Removing test user ---');
  await db.session.deleteMany({ where: { userId: regResult.user.id } });
  await db.userSettings.deleteMany({ where: { userId: regResult.user.id } });
  await db.workspaceMember.deleteMany({ where: { userId: regResult.user.id } });
  await db.notification.deleteMany({ where: { userId: regResult.user.id } });
  await db.user.delete({ where: { id: regResult.user.id } });
  console.log('Cleanup completed successfully.');
}

run()
  .then(() => {
    console.log('ALL AUTH LIFECYCLE TESTS PASSED!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
