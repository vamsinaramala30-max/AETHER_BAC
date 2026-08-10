/**
 * AETHER AI — Tool Permissions
 * Checks whether a user context satisfies the required permissions for a tool.
 * Provider-independent: works with any auth system that supplies roles/permissions.
 */

import type { AuthenticationContext } from './tool-types.js';

// ─── Permission Check Result ─────────────────────────────────────────────────

export interface PermissionCheckResult {
  readonly allowed: boolean;
  readonly missingPermissions: readonly string[];
}

// ─── IToolPermissions Interface ──────────────────────────────────────────────

export interface IToolPermissions {
  checkPermissions(
    requiredPermissions: readonly string[],
    auth: AuthenticationContext,
  ): PermissionCheckResult;
}

// ─── Tool Permissions Implementation ─────────────────────────────────────────

export class ToolPermissions implements IToolPermissions {
  public checkPermissions(
    requiredPermissions: readonly string[],
    auth: AuthenticationContext,
  ): PermissionCheckResult {
    // No permissions required → always allowed
    if (requiredPermissions.length === 0) {
      return { allowed: true, missingPermissions: [] };
    }

    // Admin role bypasses all permission checks
    if (auth.roles.includes('admin')) {
      return { allowed: true, missingPermissions: [] };
    }

    const userPermsSet = new Set(auth.permissions);
    const missing: string[] = [];

    for (const required of requiredPermissions) {
      // Wildcard permission '*' grants everything
      if (!userPermsSet.has(required) && !userPermsSet.has('*')) {
        // Check hierarchical permissions (e.g. 'tasks:*' grants 'tasks:write')
        const namespace = required.split(':')[0];
        if (namespace && !userPermsSet.has(`${namespace}:*`)) {
          missing.push(required);
        }
      }
    }

    return {
      allowed: missing.length === 0,
      missingPermissions: missing,
    };
  }
}

export const toolPermissions = new ToolPermissions();
