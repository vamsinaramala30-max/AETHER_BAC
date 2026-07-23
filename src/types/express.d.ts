import { AuthenticatedUserPayload } from '../interfaces/IRequest';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserPayload;
    }
  }
}

export {};