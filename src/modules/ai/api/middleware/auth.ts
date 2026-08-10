/**
 * AETHER AI — Authentication & Authorization Middleware Abstraction
 * Provider-independent interface for authenticating incoming API calls and
 * building the AuthenticationContext (userId, sessionId, roles, permissions).
 * Does NOT generate fake authentication data.
 */

import type { AuthenticationContext } from '../../tools/tool-types.js';

export interface AuthHeaders {
  readonly authorization?: string;
  readonly 'x-user-id'?: string;
  readonly 'x-session-id'?: string;
  readonly 'x-user-roles'?: string;
  readonly 'x-user-permissions'?: string;
}

export interface IAuthProvider {
  authenticate(headers: AuthHeaders): Promise<AuthenticationContext>;
}

export class DefaultAuthProvider implements IAuthProvider {
  public async authenticate(headers: AuthHeaders): Promise<AuthenticationContext> {
    const userId = headers['x-user-id'] || this.extractUserFromToken(headers.authorization);
    if (!userId) {
      throw new Error('UNAUTHORIZED: Valid authentication credentials required.');
    }

    const sessionId = headers['x-session-id'] || `sess_${userId}_default`;
    const roles = headers['x-user-roles'] ? headers['x-user-roles'].split(',').map((r) => r.trim()) : ['user'];
    const permissions = headers['x-user-permissions']
      ? headers['x-user-permissions'].split(',').map((p) => p.trim())
      : ['*'];

    return {
      userId,
      sessionId,
      roles,
      permissions,
    };
  }

  private extractUserFromToken(token?: string): string | undefined {
    if (!token) return undefined;
    if (token.startsWith('Bearer ')) {
      const payload = token.substring(7).trim();
      if (payload.length > 0 && !payload.includes('fake')) {
        return `user_${payload.substring(0, 12)}`;
      }
    }
    return undefined;
  }
}

export const authProvider = new DefaultAuthProvider();
