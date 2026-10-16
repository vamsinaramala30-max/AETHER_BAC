import { Socket as BaseSocket } from 'socket.io';

export interface AuthenticatedSocketUser {
  id: string;
  email: string;
  role: string;
  workspaceId?: string;
}

export interface AuthenticatedSocket extends BaseSocket {
  user?: AuthenticatedSocketUser;
}

export enum SocketEvent {
  // Connection Events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',

  // Room Subscription Events
  JOIN_WORKSPACE = 'workspace:join',
  LEAVE_WORKSPACE = 'workspace:leave',
  JOIN_PROJECT = 'project:join',
  LEAVE_PROJECT = 'project:leave',

  // AI Streaming Events
  AI_PROMPT = 'ai:prompt',
  AI_STREAM_CHUNK = 'ai:stream_chunk',
  AI_STREAM_COMPLETE = 'ai:stream_complete',
  AI_STREAM_ERROR = 'ai:stream_error',

  // Real-time Collaboration Events
  PROJECT_UPDATED = 'project:updated',
  WORKSPACE_MEMBER_MUTATED = 'workspace:member_mutated',
  WORKSPACE_MEMBER_ADDED = 'workspace:member_added',
  WORKSPACE_MEMBER_UPDATED = 'workspace:member_updated',
  WORKSPACE_MEMBER_REMOVED = 'workspace:member_removed',

  // Task Events
  TASK_CREATED = 'task:created',
  TASK_UPDATED = 'task:updated',
  TASK_COMPLETED = 'task:completed',
  TASK_DELETED = 'task:deleted',

  // Planner Events
  PLANNER_CREATED = 'planner:created',
  PLANNER_UPDATED = 'planner:updated',
  PLANNER_DELETED = 'planner:deleted',

  // Calendar Events
  CALENDAR_CREATED = 'calendar:created',
  CALENDAR_UPDATED = 'calendar:updated',
  CALENDAR_DELETED = 'calendar:deleted',

  // Focus Events
  FOCUS_STARTED = 'focus:started',
  FOCUS_COMPLETED = 'focus:completed',

  // Notification Events
  NOTIFICATION_NEW = 'notification:new',
  NOTIFICATION_CREATED = 'notification:created',
}

export interface AISreamPayload {
  conversationId: string;
  prompt: string;
  workspaceId: string;
}

