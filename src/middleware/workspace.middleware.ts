import { Request, Response, NextFunction } from 'express';
import { db } from '../database/client';
import { WorkspaceRole } from '@prisma/client';

export interface WorkspaceRequest extends Request {
  workspaceMembership?: {
    id: string;
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
  };
  workspace?: {
    id: string;
    name: string;
    slug: string;
    deletedAt: Date | null;
  };
}

const ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

const isValidUuid = (val?: string | null): boolean =>
  Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val));

export const requireWorkspaceMember = (paramName: string = 'id') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required for workspace operations.',
          },
        });
        return;
      }

      const workspaceId =
        req.params[paramName] ||
        req.params.workspaceId ||
        req.params.id ||
        (req.headers['x-workspace-id'] as string) ||
        (typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined);

      if (!workspaceId || !isValidUuid(workspaceId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WORKSPACE_ID',
            message: 'A valid workspace UUID is required.',
          },
        });
        return;
      }

      const workspace = await db.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, slug: true, deletedAt: true },
      });

      if (!workspace || workspace.deletedAt !== null) {
        res.status(404).json({
          success: false,
          error: {
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Requested workspace does not exist or has been deleted.',
          },
        });
        return;
      }

      const membership = await db.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      if (!membership) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN_WORKSPACE',
            message: 'Access denied: You are not a member of this workspace.',
          },
        });
        return;
      }

      (req as WorkspaceRequest).workspaceMembership = membership;
      (req as WorkspaceRequest).workspace = workspace;
      if (req.user) {
        req.user.workspaceId = workspaceId;
      }

      next();
    } catch (err: any) {
      next(err);
    }
  };
};

export const requireWorkspaceRole = (minRole: WorkspaceRole) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const wsReq = req as WorkspaceRequest;
    if (!wsReq.workspaceMembership) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_WORKSPACE',
          message: 'Workspace membership verification required.',
        },
      });
      return;
    }

    const currentRole = wsReq.workspaceMembership.role;
    if (ROLE_RANK[currentRole] < ROLE_RANK[minRole]) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Operation requires at least ${minRole} privileges in this workspace.`,
        },
      });
      return;
    }

    next();
  };
};
