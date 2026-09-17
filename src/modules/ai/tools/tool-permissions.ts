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

// ─── Canonical Permission Aliases Map ───────────────────────────────────────

const PERMISSION_ALIASES: Record<string, string[]> = {
  TASK_READ: ['tasks:read', 'task:read'],
  TASK_CREATE: ['tasks:write', 'task:write', 'tasks:create'],
  TASK_UPDATE: ['tasks:write', 'task:write', 'tasks:update'],
  TASK_DELETE: ['tasks:write', 'task:write', 'tasks:delete'],
  'tasks:read': ['TASK_READ'],
  'tasks:write': ['TASK_CREATE', 'TASK_UPDATE', 'TASK_DELETE'],
  NOTE_READ: ['notes:read', 'knowledge:read'],
  NOTE_CREATE: ['notes:write', 'knowledge:write'],
  NOTE_UPDATE: ['notes:write', 'knowledge:write'],
  NOTE_DELETE: ['notes:write', 'knowledge:write'],
  'notes:read': ['NOTE_READ'],
  'notes:write': ['NOTE_CREATE', 'NOTE_UPDATE', 'NOTE_DELETE'],
  MEMORY_READ: ['memory:read'],
  MEMORY_WRITE: ['memory:write'],
  MEMORY_DELETE: ['memory:delete', 'memory:write'],
  'memory:read': ['MEMORY_READ'],
  'memory:write': ['MEMORY_WRITE', 'MEMORY_DELETE'],
  KNOWLEDGE_READ: ['knowledge:read'],
  KNOWLEDGE_WRITE: ['knowledge:write'],
  KNOWLEDGE_DELETE: ['knowledge:delete', 'knowledge:write'],
  'knowledge:read': ['KNOWLEDGE_READ'],
  'knowledge:write': ['KNOWLEDGE_WRITE', 'KNOWLEDGE_DELETE'],
  PROJECT_READ: ['projects:read', 'project:read'],
  PROJECT_WRITE: ['projects:write', 'project:write'],
  'projects:read': ['PROJECT_READ'],
  'projects:write': ['PROJECT_WRITE'],
  WORKSPACE_READ: ['workspace:read'],
  WORKSPACE_WRITE: ['workspace:write'],
  'workspace:read': ['WORKSPACE_READ'],
  'workspace:write': ['WORKSPACE_WRITE'],
};

// ─── IToolPermissions Interface ──────────────────────────────────────────────

export interface IToolPermissions {
  checkPermissions(
    requiredPermissions: readonly string[],
    auth: AuthenticationContext,
  ): PermissionCheckResult;
  checkResourceAccess(
    resourceOwnerId: string,
    currentUserId: string,
    roles?: readonly string[],
  ): boolean;
  checkWorkspaceAccess(
    resourceWorkspaceId: string,
    currentWorkspaceId?: string,
    userWorkspaceIds?: readonly string[],
    roles?: readonly string[],
  ): boolean;
  checkProjectAccess(
    projectOwnerId: string,
    projectWorkspaceId?: string,
    auth?: AuthenticationContext,
  ): boolean;
  checkScope(
    resource: { ownerId?: string; workspaceId?: string },
    auth: AuthenticationContext,
  ): boolean;
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
    if (auth.roles.includes('admin') || auth.roles.includes('ADMIN') || auth.roles.includes('SUPERADMIN')) {
      return { allowed: true, missingPermissions: [] };
    }

    const userPermsSet = new Set(auth.permissions);
    const missing: string[] = [];

    for (const required of requiredPermissions) {
      // Wildcard permission '*' grants everything
      if (userPermsSet.has('*')) {
        continue;
      }

      if (userPermsSet.has(required)) {
        continue;
      }

      // Check known aliases
      const aliases = PERMISSION_ALIASES[required] || [];
      const hasAlias = aliases.some((a) => userPermsSet.has(a));
      if (hasAlias) {
        continue;
      }

      // Check hierarchical permissions (e.g. 'tasks:*' grants 'tasks:write')
      const namespace = required.split(':')[0];
      if (namespace && userPermsSet.has(`${namespace}:*`)) {
        continue;
      }

      missing.push(required);
    }

    return {
      allowed: missing.length === 0,
      missingPermissions: missing,
    };
  }

  public checkResourceAccess(
    resourceOwnerId: string,
    currentUserId: string,
    roles: readonly string[] = [],
  ): boolean {
    if (!resourceOwnerId || !currentUserId) return false;
    if (roles.includes('admin') || roles.includes('ADMIN') || roles.includes('SUPERADMIN')) return true;
    return resourceOwnerId === currentUserId;
  }

  public checkWorkspaceAccess(
    resourceWorkspaceId: string,
    currentWorkspaceId?: string,
    userWorkspaceIds: readonly string[] = [],
    roles: readonly string[] = [],
  ): boolean {
    if (!resourceWorkspaceId) return true;
    if (roles.includes('admin') || roles.includes('ADMIN') || roles.includes('SUPERADMIN')) return true;
    if (currentWorkspaceId && currentWorkspaceId === resourceWorkspaceId) return true;
    if (userWorkspaceIds.includes(resourceWorkspaceId)) return true;
    return false;
  }

  public checkProjectAccess(
    projectOwnerId: string,
    projectWorkspaceId?: string,
    auth?: AuthenticationContext,
  ): boolean {
    if (!auth) return false;
    if (auth.roles.includes('admin') || auth.roles.includes('ADMIN') || auth.roles.includes('SUPERADMIN')) return true;
    if (projectOwnerId === auth.userId) return true;
    if (projectWorkspaceId && this.checkWorkspaceAccess(projectWorkspaceId, auth.workspaceId, auth.userWorkspaceIds, auth.roles)) {
      return true;
    }
    return false;
  }

  public checkScope(
    resource: { ownerId?: string; workspaceId?: string },
    auth: AuthenticationContext,
  ): boolean {
    if (auth.roles.includes('admin') || auth.roles.includes('ADMIN') || auth.roles.includes('SUPERADMIN')) return true;

    if (resource.ownerId && !this.checkResourceAccess(resource.ownerId, auth.userId, auth.roles)) {
      return false;
    }

    if (
      resource.workspaceId &&
      !this.checkWorkspaceAccess(
        resource.workspaceId,
        auth.workspaceId,
        auth.userWorkspaceIds,
        auth.roles,
      )
    ) {
      return false;
    }

    return true;
  }
}

export const toolPermissions = new ToolPermissions();

