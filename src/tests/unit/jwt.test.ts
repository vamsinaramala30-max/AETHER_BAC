import { describe, it, expect } from 'vitest';
import { JWTService } from '../../auth/jwt';

describe('JWTService', () => {
  const payload = { id: 'usr-123', email: 'user@aether.com', role: 'ADMIN' };

  it('should issue and verify a valid access token', () => {
    const token = JWTService.signAccessToken(payload);
    expect(token).toBeDefined();

    const decoded = JWTService.verifyAccessToken(token);
    expect(decoded.id).toEqual(payload.id);
    expect(decoded.email).toEqual(payload.email);
  });

  it('should throw when verifying an invalid token', () => {
    expect(() => JWTService.verifyAccessToken('invalid.jwt.token')).toThrow();
  });
});
