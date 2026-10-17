/**
 * AETHER Autonomous Platform — Administrator Bootstrap Utility
 *
 * Secure, controlled setup script to initialize or promote an administrator account.
 * Follows least-privilege principles:
 * - NEVER hardcodes administrative credentials.
 * - Enforces minimum 12-character high-entropy password requirements.
 * - Cryptographically hashes passwords using bcrypt (10 rounds).
 * - Enters an immutable record in audit_logs.
 * - Does NOT make public registrants administrators.
 *
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts --email admin@aether.internal --password "StrongPass#2026!Secure" --role SUPERADMIN
 */

import bcrypt from 'bcryptjs';
import { db } from '../src/database/client';
import { AuthRepository } from '../src/modules/auth/auth.repository';
import { securityConfig, logger } from '../src/config';

interface BootstrapArgs {
  email?: string;
  password?: string;
  role?: string;
  fullName?: string;
}

function parseArgs(): BootstrapArgs {
  const args = process.argv.slice(2);
  const result: BootstrapArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' && args[i + 1]) {
      result.email = args[++i].trim().toLowerCase();
    } else if (arg === '--password' && args[i + 1]) {
      result.password = args[++i];
    } else if (arg === '--role' && args[i + 1]) {
      result.role = args[++i].toUpperCase();
    } else if (arg === '--fullname' && args[i + 1]) {
      result.fullName = args[++i].trim();
    }
  }

  // Support secure environment variable input to avoid process list exposure
  if (!result.password) {
    result.password = process.env.BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD;
  }

  return result;
}

function validatePasswordPolicy(password: string): { valid: boolean; reason?: string } {
  if (password.length < 12) {
    return { valid: false, reason: 'Password must be at least 12 characters in length.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one lowercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one numeric digit.' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return { valid: false, reason: 'Password must include at least one special character.' };
  }
  return { valid: true };
}

async function runBootstrap() {
  const { email, password, role = 'ADMIN', fullName } = parseArgs();

  if (!email) {
    console.error('Error: --email parameter is required.');
    console.log('Usage: npx tsx scripts/bootstrap-admin.ts --email <email> --password <password> [--role ADMIN|SUPERADMIN]');
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('Error: Provided email address format is invalid.');
    process.exit(1);
  }

  if (!['ADMIN', 'SUPERADMIN'].includes(role)) {
    console.error("Error: --role must be either 'ADMIN' or 'SUPERADMIN'.");
    process.exit(1);
  }

  const existingUser = await db.user.findUnique({ where: { email } });

  if (existingUser) {
    console.log(`User ${email} already exists. Upgrading to ${role}...`);

    const updateData: any = {
      role: role as any,
      isEmailVerified: true,
      deletedAt: null, // Ensure account is active
      tokenVersion: { increment: 1 },
    };

    if (password) {
      const policyCheck = validatePasswordPolicy(password);
      if (!policyCheck.valid) {
        console.error(`Password policy error: ${policyCheck.reason}`);
        process.exit(1);
      }
      updateData.passwordHash = await bcrypt.hash(password, securityConfig.bcrypt.saltRounds);
    }

    if (fullName) {
      updateData.fullName = fullName;
    }

    const updated = await db.user.update({
      where: { id: existingUser.id },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        userId: updated.id,
        action: 'ADMIN_BOOTSTRAP_PROMOTION',
        resource: `user:${updated.id}`,
        payload: { email: updated.email, assignedRole: role },
        ipAddress: '127.0.0.1 (CLI bootstrap)',
      },
    });

    console.log(`Successfully elevated ${email} to ${role}.`);
    console.log(`Access the admin portal at: /admin/login`);
  } else {
    if (!password) {
      console.error('Error: --password is required when creating a new administrator account.');
      process.exit(1);
    }

    const policyCheck = validatePasswordPolicy(password);
    if (!policyCheck.valid) {
      console.error(`Password policy error: ${policyCheck.reason}`);
      process.exit(1);
    }

    console.log(`Creating new ${role} account: ${email}...`);
    const passwordHash = await bcrypt.hash(password, securityConfig.bcrypt.saltRounds);

    const authRepo = new AuthRepository();
    const newUser = await authRepo.createUser({
      email,
      passwordHash,
      fullName: fullName || email.split('@')[0],
      role: role as any,
      isEmailVerified: true,
    });

    await authRepo.ensureUserWorkspaceAndSettings(newUser);

    await db.auditLog.create({
      data: {
        userId: newUser.id,
        action: 'ADMIN_BOOTSTRAP_CREATION',
        resource: `user:${newUser.id}`,
        payload: { email: newUser.email, assignedRole: role },
        ipAddress: '127.0.0.1 (CLI bootstrap)',
      },
    });

    console.log(`Successfully bootstrapped ${role} account for ${email}.`);
    console.log(`You may now authenticate via the Admin Portal at /admin/login.`);
  }

  process.exit(0);
}

runBootstrap().catch((err) => {
  logger.error('Administrator bootstrap failed:', err);
  process.exit(1);
});
