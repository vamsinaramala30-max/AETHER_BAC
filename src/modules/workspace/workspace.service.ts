import { CalendarService } from './calendar/calendar.service';
import { CalendarRepository } from './calendar/calendar.repository';
import { ProductivityService } from './productivity-hub/productivity.service';
import { ProductivityRepository } from './productivity-hub/productivity.repository';
import { FocusService } from './focus/focus.service';
import { FocusRepository } from './focus/focus.repository';
import { RecentFilesService } from './recent-files/recent-files.service';
import { RecentFilesRepository } from './recent-files/recent-files.repository';
import { FavoritesService } from './favorites/favorites.service';
import { FavoritesRepository } from './favorites/favorites.repository';
import { WorkspaceRepository } from './workspace.repository';
import { AppError } from '../../middleware/error.middleware';
import { db } from '../../database/client';
import { emitToWorkspace, emitToUser } from '../../websocket/socket';
import { SocketEvent } from '../../websocket/socketTypes';
import { WorkspaceRole } from '@prisma/client';

export class WorkspaceService {
  public readonly calendar: CalendarService;
  public readonly productivity: ProductivityService;
  public readonly focus: FocusService;
  public readonly recentFiles: RecentFilesService;
  public readonly favorites: FavoritesService;

  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    calendar?: CalendarService,
    productivity?: ProductivityService,
    focus?: FocusService,
    recentFiles?: RecentFilesService,
    favorites?: FavoritesService,
  ) {
    this.calendar = calendar || new CalendarService(new CalendarRepository());
    this.productivity = productivity || new ProductivityService(new ProductivityRepository());
    this.focus = focus || new FocusService(new FocusRepository());
    this.recentFiles = recentFiles || new RecentFilesService(new RecentFilesRepository());
    this.favorites = favorites || new FavoritesService(new FavoritesRepository());
  }

  async getOverview(workspaceId: string, userId: string) {
    if (!userId) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace || workspace.deletedAt !== null) {
      throw new AppError('Workspace not found', 404, 'NOT_FOUND');
    }

    // Verify caller belongs to workspace
    const isMember = workspace.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new AppError('Access denied: You are not a member of this workspace', 403, 'FORBIDDEN');
    }

    const [events, recent, favs, focusAnalytics] = await Promise.all([
      this.calendar.getEvents({ workspaceId, userId, limit: 5 }),
      this.recentFiles.getRecentFiles(userId, { workspaceId, limit: 5 }),
      this.favorites.getFavorites(userId, { workspaceId }),
      this.focus.getAnalytics({ workspaceId, userId }),
    ]);

    return {
      workspaceId,
      upcomingEvents: events.data,
      recentFiles: recent.data,
      favorites: favs,
      focusSummary: focusAnalytics,
    };
  }

  async getUserWorkspaces(userId: string) {
    if (!userId) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    return this.workspaceRepo.findByUserId(userId);
  }

  async createWorkspace(userId: string, data: { name: string; description?: string }) {
    if (!userId) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    if (!data.name || !data.name.trim()) {
      throw new AppError('Workspace name is required', 400, 'VALIDATION_ERROR');
    }

    const workspace = await this.workspaceRepo.createWorkspace({
      name: data.name.trim(),
      description: data.description?.trim(),
      ownerId: userId,
    });

    emitToUser(userId, SocketEvent.WORKSPACE_MEMBER_MUTATED, {
      workspaceId: workspace.id,
      action: 'CREATED',
    });

    return workspace;
  }

  async getWorkspaceById(workspaceId: string, userId: string) {
    if (!userId) {
      throw new AppError('Unauthorized: valid user ID required', 401, 'UNAUTHORIZED');
    }
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace || workspace.deletedAt !== null) {
      throw new AppError('Workspace not found', 404, 'NOT_FOUND');
    }

    // Verify caller belongs to workspace
    const isMember = workspace.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new AppError('Access denied: You are not a member of this workspace', 403, 'FORBIDDEN');
    }

    return workspace;
  }

  async updateWorkspace(
    workspaceId: string,
    userId: string,
    data: { name?: string; description?: string; logoUrl?: string },
  ) {
    const member = await this.workspaceRepo.getMember(workspaceId, userId);
    if (!member) {
      throw new AppError('Access denied: You are not a member of this workspace', 403, 'FORBIDDEN');
    }
    if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
      throw new AppError('Insufficient permissions to update workspace', 403, 'FORBIDDEN');
    }

    const updated = await this.workspaceRepo.updateWorkspace(workspaceId, data);

    emitToWorkspace(workspaceId, SocketEvent.PROJECT_UPDATED, {
      workspaceId,
      name: updated.name,
      description: updated.description,
    });

    return updated;
  }

  async deleteWorkspace(workspaceId: string, userId: string) {
    const member = await this.workspaceRepo.getMember(workspaceId, userId);
    if (!member) {
      throw new AppError('Access denied: You are not a member of this workspace', 403, 'FORBIDDEN');
    }
    if (member.role !== 'OWNER') {
      throw new AppError('Only workspace owners can delete a workspace', 403, 'FORBIDDEN');
    }

    await this.workspaceRepo.deleteWorkspace(workspaceId);

    emitToWorkspace(workspaceId, SocketEvent.WORKSPACE_MEMBER_MUTATED, {
      workspaceId,
      action: 'DELETED',
    });
  }

  async listMembers(workspaceId: string, userId: string) {
    const member = await this.workspaceRepo.getMember(workspaceId, userId);
    if (!member) {
      throw new AppError('Access denied: You are not a member of this workspace', 403, 'FORBIDDEN');
    }

    return this.workspaceRepo.listMembers(workspaceId);
  }

  async addMember(
    workspaceId: string,
    requesterId: string,
    data: { email?: string; userId?: string; role?: WorkspaceRole },
  ) {
    const requester = await this.workspaceRepo.getMember(workspaceId, requesterId);
    if (!requester || requester.role !== 'OWNER') {
      throw new AppError('Insufficient permissions: Only workspace owners can add or invite members', 403, 'FORBIDDEN');
    }

    let targetUserId = data.userId;
    let targetUser: any = null;

    if (!targetUserId && data.email) {
      targetUser = await db.user.findUnique({
        where: { email: data.email.toLowerCase().trim() },
      });
      if (!targetUser) {
        throw new AppError(`User with email "${data.email}" not found`, 404, 'USER_NOT_FOUND');
      }
      targetUserId = targetUser.id;
    } else if (targetUserId) {
      targetUser = await db.user.findUnique({
        where: { id: targetUserId },
      });
      if (!targetUser) {
        throw new AppError(`User with ID "${targetUserId}" not found`, 404, 'USER_NOT_FOUND');
      }
    }

    if (!targetUserId) {
      throw new AppError('User email or ID is required', 400, 'VALIDATION_ERROR');
    }

    // Check existing membership
    const existing = await this.workspaceRepo.getMember(workspaceId, targetUserId);
    if (existing) {
      throw new AppError('User is already a member of this workspace', 409, 'ALREADY_MEMBER');
    }

    const assignedRole = data.role || 'MEMBER';
    if (assignedRole === 'OWNER' && requester.role !== 'OWNER') {
      throw new AppError('Only workspace owners can assign the OWNER role', 403, 'FORBIDDEN');
    }

    const newMember = await this.workspaceRepo.addMember(workspaceId, targetUserId, assignedRole);

    // Durable Audit Log
    try {
      await db.auditLog.create({
        data: {
          userId: requesterId,
          action: 'WORKSPACE_MEMBER_ADDED',
          resource: `workspace:${workspaceId}`,
          payload: { targetUserId, role: assignedRole },
        },
      });
    } catch {
      // Audit log resilience
    }

    // Durable Notification creation
    try {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      await db.notification.create({
        data: {
          userId: targetUserId,
          title: 'Workspace Invitation',
          message: `You were added to workspace "${workspace?.name || 'Workspace'}" as ${assignedRole}.`,
          type: 'WORKSPACE',
        },
      });

      // Realtime notification & workspace event
      emitToUser(targetUserId, SocketEvent.NOTIFICATION_NEW, {
        title: 'Workspace Invitation',
        message: `You were added to workspace "${workspace?.name || 'Workspace'}" as ${assignedRole}.`,
        type: 'WORKSPACE',
      });
    } catch {
      // Notification dispatch resilience
    }

    emitToWorkspace(workspaceId, SocketEvent.WORKSPACE_MEMBER_ADDED, {
      workspaceId,
      member: newMember,
    });
    emitToWorkspace(workspaceId, SocketEvent.WORKSPACE_MEMBER_MUTATED, {
      workspaceId,
      action: 'ADDED',
      memberId: newMember.id,
    });

    return newMember;
  }

  async updateMemberRole(
    workspaceId: string,
    requesterId: string,
    targetUserId: string,
    role: WorkspaceRole,
  ) {
    const requester = await this.workspaceRepo.getMember(workspaceId, requesterId);
    if (!requester || requester.role !== 'OWNER') {
      throw new AppError('Insufficient permissions: Only workspace owners can update member roles', 403, 'FORBIDDEN');
    }

    const targetMember = await this.workspaceRepo.getMember(workspaceId, targetUserId);
    if (!targetMember) {
      throw new AppError('Member not found in this workspace', 404, 'NOT_FOUND');
    }

    if (targetMember.role === 'OWNER' && requester.role !== 'OWNER') {
      throw new AppError('Only workspace owners can modify owner roles', 403, 'FORBIDDEN');
    }

    if (role === 'OWNER' && requester.role !== 'OWNER') {
      throw new AppError('Only workspace owners can promote members to OWNER', 403, 'FORBIDDEN');
    }

    // Guard: Prevent demoting the last remaining OWNER
    if (targetMember.role === 'OWNER' && role !== 'OWNER') {
      const ownerCount = await this.workspaceRepo.countOwners(workspaceId);
      if (ownerCount <= 1) {
        throw new AppError('Cannot demote the sole workspace owner', 400, 'CANNOT_DEMOTE_SOLE_OWNER');
      }
    }

    const updated = await this.workspaceRepo.updateMemberRole(workspaceId, targetUserId, role);

    // Durable Audit Log
    try {
      await db.auditLog.create({
        data: {
          userId: requesterId,
          action: 'WORKSPACE_MEMBER_ROLE_UPDATED',
          resource: `workspace:${workspaceId}`,
          payload: { targetUserId, newRole: role, previousRole: targetMember.role },
        },
      });
    } catch {
      // Audit log resilience
    }

    emitToWorkspace(workspaceId, SocketEvent.WORKSPACE_MEMBER_UPDATED, {
      workspaceId,
      member: updated,
    });
    emitToWorkspace(workspaceId, SocketEvent.WORKSPACE_MEMBER_MUTATED, {
      workspaceId,
      action: 'UPDATED',
      memberId: updated.id,
    });

    return updated;
  }

  async removeMember(workspaceId: string, requesterId: string, targetUserId: string) {
    const requester = await this.workspaceRepo.getMember(workspaceId, requesterId);
    if (!requester) {
      throw new AppError('Access denied: You are not a member of this workspace', 403, 'FORBIDDEN');
    }

    const targetMember = await this.workspaceRepo.getMember(workspaceId, targetUserId);
    if (!targetMember) {
      throw new AppError('Member not found in this workspace', 404, 'NOT_FOUND');
    }

    const isSelf = requesterId === targetUserId;

    if (!isSelf) {
      // Only Owner can remove another member
      if (requester.role !== 'OWNER') {
        throw new AppError('Insufficient permissions: Only workspace owners can remove members', 403, 'FORBIDDEN');
      }
    }

    // Guard: Prevent sole owner from leaving/removing themselves
    if (targetMember.role === 'OWNER') {
      const ownerCount = await this.workspaceRepo.countOwners(workspaceId);
      if (ownerCount <= 1) {
        throw new AppError(
          'Cannot remove or leave as the sole workspace owner. Transfer ownership first.',
          400,
          'CANNOT_REMOVE_SOLE_OWNER',
        );
      }
    }

    await this.workspaceRepo.removeMember(workspaceId, targetUserId);

    // Durable Audit Log
    try {
      await db.auditLog.create({
        data: {
          userId: requesterId,
          action: isSelf ? 'WORKSPACE_MEMBER_LEFT' : 'WORKSPACE_MEMBER_REMOVED',
          resource: `workspace:${workspaceId}`,
          payload: { targetUserId, removedBy: requesterId },
        },
      });
    } catch {
      // Audit log resilience
    }

    emitToWorkspace(workspaceId, SocketEvent.WORKSPACE_MEMBER_REMOVED, {
      workspaceId,
      userId: targetUserId,
    });
    emitToWorkspace(workspaceId, SocketEvent.WORKSPACE_MEMBER_MUTATED, {
      workspaceId,
      action: 'REMOVED',
      userId: targetUserId,
    });

    return true;
  }

  async leaveWorkspace(workspaceId: string, userId: string) {
    return this.removeMember(workspaceId, userId, userId);
  }
}

export const workspaceService = new WorkspaceService(new WorkspaceRepository());

