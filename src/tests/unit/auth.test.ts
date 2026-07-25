import { describe, it, expect } from 'vitest';
import { RoleService, Role } from '../../auth/role';
import { PermissionService, Permission } from '../../auth/permissions';

describe('Role and Permission Verification', () => {
  it('should validate hierarchy correctly', () => {
    expect(RoleService.hasRoleLevel(Role.SUPER_ADMIN, Role.ADMIN)).toBe(true);
    expect(RoleService.hasRoleLevel(Role.VIEWER, Role.ADMIN)).toBe(false);
  });

  it('should verify granular permissions per role', () => {
    expect(PermissionService.hasPermission(Role.ADMIN, Permission.PROJECT_CREATE)).toBe(true);
    expect(PermissionService.hasPermission(Role.VIEWER, Permission.PROJECT_CREATE)).toBe(false);
  });
});
