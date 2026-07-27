export enum UserEventType {
  USER_REGISTERED = 'user.registered',
  USER_LOGGED_IN = 'user.logged_in',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  PASSWORD_RESET_REQUESTED = 'user.password_reset_requested',
}

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

export interface UserLoggedInPayload {
  userId: string;
  email: string;
  ipAddress?: string;
  loggedInAt: Date;
}

export interface UserUpdatedPayload {
  userId: string;
  updatedFields: string[];
  updatedAt: Date;
}
