import { describe, it, expect, vi, beforeEach } from 'vitest';
import passport from 'passport';
import { authController } from '../../modules/auth/auth.controller';

describe('Google OAuth Callback Flow & Unbound Method Safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles googleCallback when passed as a detached function reference without throwing TypeError', async () => {
    // Detach the method from authController (simulating Express router invocation)
    const { googleCallback } = authController;

    // Mock passport.authenticate to simulate a strategy failure
    const mockAuthenticate = vi.spyOn(passport, 'authenticate').mockImplementation((_strategy: any, _options: any, callback?: any) => {
      return ((_req: any, _res: any, _next: any) => {
        if (callback) {
          callback(new Error('OAuth failed'), null);
        }
      }) as any;
    });

    const req: any = { query: { code: 'test-code' } };
    let redirectedUrl = '';
    const res: any = {
      redirect: vi.fn((url: string) => {
        redirectedUrl = url;
      }),
    };
    const next = vi.fn();

    // Call detached handler
    googleCallback(req, res, next);

    expect(mockAuthenticate).toHaveBeenCalledWith('google', { session: false }, expect.any(Function));
    expect(res.redirect).toHaveBeenCalled();
    expect(redirectedUrl).toContain('/login?error=oauth_failed');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects to /login?error=oauth_user_missing when passport returns no user', async () => {
    const { googleCallback } = authController;

    vi.spyOn(passport, 'authenticate').mockImplementation((_strategy: any, _options: any, callback?: any) => {
      return ((_req: any, _res: any, _next: any) => {
        if (callback) {
          callback(null, null);
        }
      }) as any;
    });

    const req: any = { query: {} };
    let redirectedUrl = '';
    const res: any = {
      redirect: vi.fn((url: string) => {
        redirectedUrl = url;
      }),
    };
    const next = vi.fn();

    googleCallback(req, res, next);

    expect(res.redirect).toHaveBeenCalled();
    expect(redirectedUrl).toContain('/login?error=oauth_user_missing');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects to /auth/success?token=... when passport returns a valid user with token', async () => {
    const { googleCallback } = authController;

    const mockUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'testuser@example.com',
      fullName: 'Test User',
      role: 'USER',
      tokens: {
        accessToken: 'mock-jwt-access-token-12345',
      },
    };

    vi.spyOn(passport, 'authenticate').mockImplementation((_strategy: any, _options: any, callback?: any) => {
      return ((_req: any, _res: any, _next: any) => {
        if (callback) {
          callback(null, mockUser);
        }
      }) as any;
    });

    const req: any = { query: { code: 'valid-google-code' } };
    let redirectedUrl = '';
    const res: any = {
      redirect: vi.fn((url: string) => {
        redirectedUrl = url;
      }),
    };
    const next = vi.fn();

    await googleCallback(req, res, next);

    expect(res.redirect).toHaveBeenCalled();
    expect(redirectedUrl).toContain('/auth/success?token=mock-jwt-access-token-12345');
    expect(next).not.toHaveBeenCalled();
  });

  it('handles googleAuth when passed as a detached function reference', () => {
    const { googleAuth } = authController;

    const mockAuthenticate = vi.spyOn(passport, 'authenticate').mockImplementation(() => {
      return ((_req: any, _res: any, _next: any) => {}) as any;
    });

    const req: any = { query: {} };
    const res: any = { redirect: vi.fn() };
    const next = vi.fn();

    googleAuth(req, res, next);

    expect(mockAuthenticate).toHaveBeenCalledWith('google', {
      scope: ['profile', 'email'],
      session: false,
    });
    expect(next).not.toHaveBeenCalled();
  });
});
