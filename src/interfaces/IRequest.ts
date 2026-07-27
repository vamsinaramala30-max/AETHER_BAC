import { Request } from 'express';

export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  role: string;
  workspaceId?: string;
}

export interface IRequest extends Request {
  user?: AuthenticatedUserPayload;
}
