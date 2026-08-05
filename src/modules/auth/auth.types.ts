export interface AuthTokenPayload {
  id: string;
  email: string;
  role: string;
  workspaceId?: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName?: string | null;
    name?: string | null;
    role: string;
    avatarUrl?: string | null;
    bio?: string | null;
    company?: string | null;
    timezone?: string | null;
    language?: string | null;
    isEmailVerified?: boolean;
    workspaceId?: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
}

export interface OAuthUserPayload {
  provider: string;
  providerAccountId: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
}

export interface GoogleUserPayload {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
}
