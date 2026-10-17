/**
 * Authoritative Owner Allowlist Configuration
 *
 * Requirements (Phase 3):
 * 1. Identifier 1: vamsinaramala30@g.com -> Registered in database as vamsinaramala30@gmail.com
 * 2. Identifier 2: vkgroups127@g -> Incomplete domain specified; awaiting verification before activation.
 *
 * Strictly normalizes email comparisons and enforces server-controlled owner designation.
 */

export interface OwnerVerificationResult {
  isVerifiedOwner: boolean;
  normalizedEmail: string;
  discrepancyNote?: string;
}

// Authoritative normalized owner allowlist
const VERIFIED_OWNER_EMAILS = new Set<string>([
  'vamsinaramala30@gmail.com', // Normalized active verified owner account (UUID: 72bd2cc9-363f-447d-9f06-dce7abe06546)
]);

// Documented audit tracking for requested identifiers
export const OWNER_IDENTIFIER_AUDIT = [
  {
    requestedIdentifier: 'vamsinaramala30@g.com',
    registeredEmail: 'vamsinaramala30@gmail.com',
    status: 'ACTIVE_VERIFIED',
    userId: '72bd2cc9-363f-447d-9f06-dce7abe06546',
    notes: 'Registered with full gmail.com domain in users table; verified active owner of vk nam\'s Workspace.',
  },
  {
    requestedIdentifier: 'vkgroups127@g',
    registeredEmail: null,
    status: 'PENDING_EXACT_VERIFICATION',
    userId: null,
    notes: 'Incomplete domain supplied (@g). Unregistered in database. Kept inactive per strict specification.',
  },
] as const;

export function isVerifiedOwnerEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  return VERIFIED_OWNER_EMAILS.has(email.trim().toLowerCase());
}

export function checkOwnerStatus(email?: string | null): OwnerVerificationResult {
  if (!email || typeof email !== 'string') {
    return { isVerifiedOwner: false, normalizedEmail: '' };
  }
  const normalized = email.trim().toLowerCase();
  const isVerified = VERIFIED_OWNER_EMAILS.has(normalized);

  let discrepancyNote: string | undefined;
  if (normalized === 'vamsinaramala30@g.com') {
    discrepancyNote =
      'Specified as vamsinaramala30@g.com; actual registered account is vamsinaramala30@gmail.com.';
  } else if (normalized.startsWith('vkgroups127')) {
    discrepancyNote =
      'Account vkgroups127@g has an incomplete domain and is not registered in the database.';
  }

  return {
    isVerifiedOwner: isVerified,
    normalizedEmail: normalized,
    discrepancyNote,
  };
}
