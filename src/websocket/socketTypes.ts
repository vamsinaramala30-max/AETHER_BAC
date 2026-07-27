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

  // Notification Events
  NOTIFICATION_NEW = 'notification:new',
}

export interface AISreamPayload {
  conversationId: string;
  prompt: string;
  workspaceId: string;
}
