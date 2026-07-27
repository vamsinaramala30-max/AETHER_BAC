export interface AuthTokenPayload {
  id: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    avatarUrl?: string | null;
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
