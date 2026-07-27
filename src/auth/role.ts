export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export const RoleHierarchy: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 40,
  [Role.ADMIN]: 30,
  [Role.MEMBER]: 20,
  [Role.VIEWER]: 10,
};

export class RoleService {
  /**
   * Evaluates if a role meets or exceeds a target role level.
   */
  public static hasRoleLevel(userRole: string | Role, requiredRole: Role): boolean {
    const userLevel = RoleHierarchy[userRole as Role] || 0;
    const requiredLevel = RoleHierarchy[requiredRole];
    return userLevel >= requiredLevel;
  }

  /**
   * Validates whether a given string matches a recognized Role.
   */
  public static isValidRole(role: string): role is Role {
    return Object.values(Role).includes(role as Role);
  }
}
