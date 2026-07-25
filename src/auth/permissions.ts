import { Role } from './role';

export enum Permission {
  // Workspace permissions
  WORKSPACE_READ = 'workspace:read',
  WORKSPACE_UPDATE = 'workspace:update',
  WORKSPACE_DELETE = 'workspace:delete',
  WORKSPACE_MANAGE_MEMBERS = 'workspace:manage_members',

  // Project permissions
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',

  // AI & RAG permissions
  AI_EXECUTE = 'ai:execute',
  KNOWLEDGE_MANAGE = 'knowledge:manage',

  // System & Admin permissions
  ADMIN_ACCESS = 'admin:access',
  AUDIT_READ = 'audit:read',
}

const RolePermissionsMap: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),
  [Role.ADMIN]: [
    Permission.WORKSPACE_READ,
    Permission.WORKSPACE_UPDATE,
    Permission.WORKSPACE_MANAGE_MEMBERS,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.AI_EXECUTE,
    Permission.KNOWLEDGE_MANAGE,
    Permission.ADMIN_ACCESS,
    Permission.AUDIT_READ,
  ],
  [Role.MEMBER]: [
    Permission.WORKSPACE_READ,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.AI_EXECUTE,
    Permission.KNOWLEDGE_MANAGE,
  ],
  [Role.VIEWER]: [
    Permission.WORKSPACE_READ,
    Permission.PROJECT_READ,
  ],
};

export class PermissionService {
  /**
   * Checks if a role is granted a specific granular Permission.
   */
  public static hasPermission(role: Role | string, permission: Permission): boolean {
    const permissions = RolePermissionsMap[role as Role] || [];
    return permissions.includes(permission);
  }

  /**
   * Checks if a role is granted ALL specified permissions.
   */
  public static hasAllPermissions(role: Role | string, requiredPermissions: Permission[]): boolean {
    return requiredPermissions.every((perm) => PermissionService.hasPermission(role, perm));
  }
}