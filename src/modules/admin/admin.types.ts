export interface AdminOverviewMetrics {
  users: {
    total: number;
    active: number;
    unverified: number;
    suspended: number;
    twoFactorEnabled: number;
    admins: number;
  };
  system: {
    nodeVersion: string;
    memoryUsage: NodeJS.MemoryUsage;
    uptimeSeconds: number;
    environment: string;
  };
  services: {
    database: {
      status: 'up' | 'degraded' | 'down';
      latencyMs?: number;
      version?: string;
      provider: 'self-hosted-postgresql' | 'managed-postgresql';
    };
    redis: {
      status: 'up' | 'down' | 'unconfigured';
    };
    aiModel: {
      status: 'up' | 'down' | 'unconfigured';
      endpoint?: string;
    };
    storage: {
      driver: 'local' | 'supabase';
      status: 'ready' | 'misconfigured';
    };
  };
  backups: {
    lastBackupTimestamp: string | null;
    lastRestoreVerificationTimestamp: string | null;
    status: 'healthy' | 'warning' | 'unverified' | 'failed';
    backupSizeBytes?: number;
    evidenceFound: boolean;
    storagePath?: string;
    details: string;
  };
  recentSecurityEvents: Array<{
    id: string;
    action: string;
    actorEmail?: string | null;
    ipAddress?: string | null;
    resource: string;
    createdAt: Date;
    payload?: any;
  }>;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  username?: string | null;
  fullName?: string | null;
  role: string;
  isEmailVerified: boolean;
  is2FAEnabled: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface AdminUserQueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'ALL';
}

export interface AdminAuditLogQueryOptions {
  page?: number;
  limit?: number;
  action?: string;
  userId?: string;
}

export interface AdminLoginResult {
  mfaRequired?: boolean;
  mfaTicket?: string;
  user?: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    avatarUrl?: string | null;
  };
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
}
