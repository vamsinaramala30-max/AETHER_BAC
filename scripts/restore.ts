/**
 * AETHER Enterprise Platform — Production Restore & Disaster Recovery Verification (P3C-04)
 * Validates backup manifest signatures, verifies archive integrity, decrypts AES-256
 * archives, and safely executes isolated restoration drills without corrupting existing tenant data.
 *
 * Safety Constraints:
 * - NEVER executes against active production without explicit --confirm-non-production flag.
 * - Detects files created after database backup snapshot (post-backup orphan file reconciliation).
 * - Validates SHA-256 checksums of all input artifacts before restore.
 * - Decrypts AES-256-CBC PBKDF2 archives matching OpenSSL format.
 * - Restores into isolated disposable environment only; refuses to restore to remote production hosts.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { Client } from 'pg';
import {
  BackupManifest,
  computeFileSha256,
  computeManifestHmac,
  parseDatabaseConnectionParams,
  ParsedDbParams,
  MAGIC_GCM_HEADER,
} from './backup';

export interface RestoreOptions {
  readonly isDryRun?: boolean;
  readonly targetEnvironment?: string;
  readonly confirmNonProduction?: boolean;
  readonly targetDatabaseUrl?: string;
  readonly encryptionKey?: string;
  readonly hmacSecret?: string;
  readonly allowUnsignedLegacy?: boolean;
  readonly pgRestorePath?: string;
  readonly keepDecryptedDump?: boolean;
  readonly expectedMinimumTables?: number;
}

export interface RestoreVerificationResult {
  readonly valid: boolean;
  readonly manifest: BackupManifest;
  readonly checksumsMatch: boolean;
  readonly postBackupOrphanFilesDetected: number;
  readonly orphanFilePaths: string[];
  readonly dryRun: boolean;
  readonly restoredTablesCount?: number;
  readonly vectorExtensionVerified?: boolean;
  readonly error?: string;
}

export interface VerifyManifestResult {
  readonly verified: boolean;
  readonly isLegacy: boolean;
  readonly reason: string;
}

/**
 * Validates cryptographic authenticity of the backup manifest using HMAC-SHA256.
 * Binds the manifest to an authoritative HMAC key to prevent substitution attacks.
 */
export const verifyManifestAuthenticity = (
  manifest: BackupManifest,
  hmacSecret?: string,
  options: { allowUnsignedLegacy?: boolean; requireSignedManifest?: boolean } = {},
): VerifyManifestResult => {
  const secret =
    hmacSecret ||
    process.env.BACKUP_HMAC_SECRET ||
    process.env.AETHER_BACKUP_HMAC_SECRET ||
    process.env.BACKUP_SIGNING_KEY;

  const isSecureFormat =
    manifest.signatureAlgorithm === 'HMAC-SHA256' ||
    Boolean(manifest.hmacSignature) ||
    manifest.version === '1.1.0';

  if (manifest.hmacSignature) {
    if (!secret) {
      throw new Error(
        'AUTHENTICATION_FAILED: Backup manifest contains an HMAC signature but no verification secret was supplied via BACKUP_HMAC_SECRET or options.',
      );
    }
    const expectedHmac = computeManifestHmac(manifest, secret);
    const sigBuf = Buffer.from(manifest.hmacSignature, 'hex');
    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new Error(
        'AUTHENTICATION_FAILED: Backup manifest HMAC signature verification failed! Manifest metadata may have been modified or signed with a different key.',
      );
    }
    console.log('✓ Backup manifest HMAC-SHA256 authenticity verified.');
    return {
      verified: true,
      isLegacy: false,
      reason: 'Manifest HMAC-SHA256 signature verified successfully.',
    };
  }

  // Reject unsigned manifests for the new secure format
  if (isSecureFormat) {
    throw new Error(
      'SECURITY_VIOLATION: Unsigned manifest rejected for new secure format (v1.1.0 / HMAC-SHA256). Secure manifests must contain a valid HMAC signature.',
    );
  }

  // Backward compatibility for existing legacy v1.0.0 manifests
  const requireSigned =
    options.requireSignedManifest ||
    process.env.REQUIRE_SIGNED_MANIFEST === 'true' ||
    process.env.NODE_ENV === 'production';

  if (requireSigned && !options.allowUnsignedLegacy && process.env.ALLOW_UNSIGNED_MANIFEST !== 'true') {
    throw new Error(
      'SECURITY_VIOLATION: Unsigned legacy backup manifest rejected by security policy. Supply an authenticated v1.1.0 manifest or pass allowUnsignedLegacy: true / ALLOW_UNSIGNED_MANIFEST=true for legacy recovery.',
    );
  }

  console.warn(
    '[AETHER Security Warning] Restoring from legacy unsigned manifest (v1.0.0). Cryptographic authenticity cannot be verified.',
  );
  return {
    verified: false,
    isLegacy: true,
    reason: 'Legacy unsigned manifest (v1.0.0) permitted with security warning for backward compatibility.',
  };
};

/**
 * Authenticated AES-256-GCM decryption with legacy OpenSSL AES-256-CBC PBKDF2 backward compatibility.
 * Cryptographically verifies ciphertext authenticity and auth tag before releasing decrypted data.
 */
export const decryptFileWithAes256 = (inputPath: string, outputPath: string, password: string): void => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Decryption failed: file does not exist at ${inputPath}`);
  }

  const inputBuffer = fs.readFileSync(inputPath);
  if (inputBuffer.length < 16) {
    throw new Error('Decryption failed: encrypted file is too short to contain cryptographic headers.');
  }

  // 1. Authenticated AES-256-GCM Format (AETHER_GCM_V1)
  if (inputBuffer.length >= MAGIC_GCM_HEADER.length && inputBuffer.subarray(0, MAGIC_GCM_HEADER.length).equals(MAGIC_GCM_HEADER)) {
    const minGcmLength = MAGIC_GCM_HEADER.length + 16 + 12 + 16; // Header + Salt + IV + Tag
    if (inputBuffer.length < minGcmLength) {
      throw new Error('Decryption failed: archive truncated, missing complete GCM metadata headers.');
    }

    const saltOffset = MAGIC_GCM_HEADER.length;
    const salt = inputBuffer.subarray(saltOffset, saltOffset + 16);
    const ivOffset = saltOffset + 16;
    const iv = inputBuffer.subarray(ivOffset, ivOffset + 12);
    const tagOffset = ivOffset + 12;
    const authTag = inputBuffer.subarray(tagOffset, tagOffset + 16);
    const ciphertext = inputBuffer.subarray(tagOffset + 16);

    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      fs.writeFileSync(outputPath, decrypted);
      return;
    } catch (e: any) {
      throw new Error(`AUTHENTICATION_FAILED: Decryption integrity check failed. Ciphertext or auth tag tampered with, or invalid key (${e.message}).`);
    }
  }

  // 2. Legacy OpenSSL-compatible AES-256-CBC PBKDF2 Format (Salted__)
  const magic = inputBuffer.subarray(0, 8).toString('utf-8');
  if (magic === 'Salted__') {
    const salt = inputBuffer.subarray(8, 16);
    const ciphertext = inputBuffer.subarray(16);

    const derived = crypto.pbkdf2Sync(password, salt, 100000, 48, 'sha256');
    const key = derived.subarray(0, 32);
    const iv = derived.subarray(32, 48);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    fs.writeFileSync(outputPath, decrypted);
    return;
  }

  throw new Error('Decryption failed: invalid file header (unrecognized archive format).');
};

/**
 * Detect pg_restore binary on host system
 */
export const findPgRestoreBinary = (customPath?: string): string | null => {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  if (process.env.PG_RESTORE_PATH && fs.existsSync(process.env.PG_RESTORE_PATH)) {
    return process.env.PG_RESTORE_PATH;
  }

  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? 'where.exe' : 'which';
  try {
    const res = spawnSync(checkCmd, ['pg_restore'], { stdio: 'pipe', encoding: 'utf-8' });
    if (res.status === 0 && res.stdout) {
      const firstLine = res.stdout.trim().split(/\r?\n/)[0];
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    }
  } catch {
    // Ignore and proceed to standard filesystem locations
  }

  // Standard locations
  const standardPaths: string[] = [];
  if (isWindows) {
    const basePaths = ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL'];
    for (const base of basePaths) {
      if (fs.existsSync(base)) {
        const versions = fs.readdirSync(base);
        for (const ver of versions) {
          standardPaths.push(path.join(base, ver, 'bin', 'pg_restore.exe'));
        }
      }
    }
    // Check user profile, local app data, and portable tools directories
    const userProfile = process.env.USERPROFILE || '';
    if (userProfile) {
      standardPaths.push(
        path.join(userProfile, 'pgsql', 'bin', 'pg_restore.exe'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'PostgreSQL', 'bin', 'pg_restore.exe'),
        path.join(userProfile, 'scoop', 'apps', 'postgresql', 'current', 'bin', 'pg_restore.exe'),
      );
    }
    standardPaths.push(
      path.resolve(process.cwd(), 'tools', 'pgsql', 'bin', 'pg_restore.exe'),
      path.resolve(process.cwd(), '..', 'tools', 'pgsql', 'bin', 'pg_restore.exe'),
    );
  } else {
    standardPaths.push(
      '/usr/bin/pg_restore',
      '/usr/local/bin/pg_restore',
      '/opt/homebrew/bin/pg_restore',
      '/usr/lib/postgresql/16/bin/pg_restore',
      '/usr/lib/postgresql/17/bin/pg_restore',
    );
  }

  for (const p of standardPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
};

export const verifyAndReconcileRestore = async (
  backupDir: string,
  options: RestoreOptions = {},
): Promise<RestoreVerificationResult> => {
  const isDryRun = options.isDryRun ?? true;
  const isConfirmedNonProd = options.confirmNonProduction ?? false;
  const encryptionKey = options.encryptionKey || process.env.BACKUP_ENCRYPTION_KEY;

  console.log(`[AETHER Restore] Initializing recovery verification for directory: ${backupDir}`);

  // Safety gate: never restore against production without confirmation
  if (!isDryRun && !isConfirmedNonProd) {
    throw new Error(
      'RESTORE_ABORTED: Refusing to execute live restoration without explicit --confirm-non-production flag. Production safety policy enforced.',
    );
  }

  // Target database sanity check: strictly prevent restoring into source database or remote production
  if (options.targetDatabaseUrl) {
    const targetParams = parseDatabaseConnectionParams(options.targetDatabaseUrl);

    // Guard 1: Strictly forbid restoring into configured source DATABASE_URL
    const configuredSourceUrl = process.env.DATABASE_URL;
    if (configuredSourceUrl) {
      try {
        const sourceParams = parseDatabaseConnectionParams(configuredSourceUrl);
        if (
          targetParams.host.toLowerCase() === sourceParams.host.toLowerCase() &&
          targetParams.database.toLowerCase() === sourceParams.database.toLowerCase()
        ) {
          throw new Error(
            'RESTORE_ABORTED: Refusing to restore into active source database! Target host and database match source DATABASE_URL.',
          );
        }
      } catch (err: any) {
        if (err.message.includes('RESTORE_ABORTED')) throw err;
      }
    }

    // Guard 2: Refuse restoration against remote Supabase or production cloud hostnames
    if (
      targetParams.host.includes('supabase.co') ||
      targetParams.host.includes('supabase.com') ||
      targetParams.host.includes('rds.amazonaws.com') ||
      targetParams.host.endsWith('.prod') ||
      targetParams.host.includes('production')
    ) {
      throw new Error(
        'RESTORE_ABORTED: Refusing to execute restoration against remote Supabase host. Isolated recovery must target disposable PostgreSQL.',
      );
    }
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`RESTORE_FAILED: Backup manifest missing at ${manifestPath}`);
  }

  const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  let decryptedTempFile: string | null = null;

  // Verify manifest authenticity before trusting any paths, checksums, or instructions
  const hmacSecret =
    options.hmacSecret ||
    process.env.BACKUP_HMAC_SECRET ||
    process.env.AETHER_BACKUP_HMAC_SECRET ||
    process.env.BACKUP_SIGNING_KEY;
  verifyManifestAuthenticity(manifest, hmacSecret, {
    allowUnsignedLegacy: options.allowUnsignedLegacy,
  });

  try {
    // 1. Verify Database Checksum & Decrypt if needed
    if (manifest.artifacts.database) {
      const dbArtifact = manifest.artifacts.database;
      if (!dbArtifact.sha256 || typeof dbArtifact.sha256 !== 'string' || dbArtifact.sha256.trim() === '') {
        throw new Error('INTEGRITY_VIOLATION: Manifest is missing required database SHA-256 checksum.');
      }
      let rawDumpPath = path.join(backupDir, dbArtifact.filename);

      // Check for encrypted artifact
      const encFilename = dbArtifact.encryptedFilename || `${dbArtifact.filename}.enc`;
      const encFilePath = path.join(backupDir, encFilename);

      if (!fs.existsSync(rawDumpPath) && fs.existsSync(encFilePath)) {
        if (!encryptionKey) {
          throw new Error('RESTORE_FAILED: Archive is encrypted but BACKUP_ENCRYPTION_KEY was not provided.');
        }

        // Require encryptedSha256 before invoking decryption
        if (
          !dbArtifact.encryptedSha256 ||
          typeof dbArtifact.encryptedSha256 !== 'string' ||
          dbArtifact.encryptedSha256.trim() === ''
        ) {
          throw new Error(
            'INTEGRITY_VIOLATION: Manifest is missing required encrypted database archive SHA-256 checksum.',
          );
        }

        const computedEncSha = computeFileSha256(encFilePath);
        if (computedEncSha !== dbArtifact.encryptedSha256) {
          throw new Error(
            `INTEGRITY_VIOLATION: Encrypted database archive checksum mismatch! Expected ${dbArtifact.encryptedSha256}, got ${computedEncSha}`,
          );
        }
        console.log('✓ Encrypted database archive checksum verified.');

        console.log('[AETHER Restore] Decrypting AES-256 archive...');
        decryptedTempFile = path.join(backupDir, `decrypted_${Date.now()}_${dbArtifact.filename}`);
        decryptFileWithAes256(encFilePath, decryptedTempFile, encryptionKey);
        rawDumpPath = decryptedTempFile;
      }

      if (!fs.existsSync(rawDumpPath)) {
        throw new Error(`RESTORE_FAILED: Database dump file missing: ${rawDumpPath}`);
      }

      const computedDbSha = computeFileSha256(rawDumpPath);
      if (computedDbSha !== dbArtifact.sha256) {
        throw new Error(
          `INTEGRITY_VIOLATION: Database checksum mismatch! Expected ${dbArtifact.sha256}, got ${computedDbSha}`,
        );
      }
      console.log('✓ Database dump checksum verified.');

      // Execute live pg_restore if not dry-run
      if (!isDryRun) {
        if (!options.targetDatabaseUrl) {
          throw new Error('RESTORE_FAILED: Live restore requested but targetDatabaseUrl was not provided.');
        }

        const pgRestoreBin = findPgRestoreBinary(options.pgRestorePath);
        if (!pgRestoreBin) {
          throw new Error('PG_RESTORE_TOOL_MISSING: pg_restore binary not found in PATH or standard directories.');
        }

        const targetParams = parseDatabaseConnectionParams(options.targetDatabaseUrl);
        console.log(`[AETHER Restore] Restoring database into isolated host: ${targetParams.host}:${targetParams.port}/${targetParams.database}`);

        const env: NodeJS.ProcessEnv = {
          ...process.env,
          PGHOST: targetParams.host,
          PGPORT: targetParams.port,
          PGUSER: targetParams.user,
          PGDATABASE: targetParams.database,
        };
        if (targetParams.password) {
          env.PGPASSWORD = targetParams.password;
        }
        if (targetParams.sslmode) {
          env.PGSSLMODE = targetParams.sslmode;
        }

        const restoreArgs = ['--clean', '--if-exists', '--no-owner', '-v', '-d', targetParams.database, rawDumpPath];
        const res = spawnSync(pgRestoreBin, restoreArgs, { env, stdio: 'pipe', encoding: 'utf-8' });

        if (res.status !== 0) {
          const sanitizedMsg = (res.stderr || res.error?.message || 'pg_restore failed')
            .replace(new RegExp(targetParams.password || '___none___', 'g'), '***REDACTED***');
          throw new Error(`PG_RESTORE_FAILED: ${sanitizedMsg}`);
        }
        console.log('✓ Database pg_restore command executed successfully.');
      }
    }

    // 2. Verify Storage Checksum
    if (manifest.artifacts.storage) {
      const storageFilePath = path.join(backupDir, manifest.artifacts.storage.filename);
      if (!fs.existsSync(storageFilePath)) {
        throw new Error(`RESTORE_FAILED: Storage archive missing: ${storageFilePath}`);
      }
      const computedStorageSha = computeFileSha256(storageFilePath);
      if (computedStorageSha !== manifest.artifacts.storage.sha256) {
        throw new Error(
          `INTEGRITY_VIOLATION: Storage archive checksum mismatch! Expected ${manifest.artifacts.storage.sha256}, got ${computedStorageSha}`,
        );
      }
      console.log('✓ Storage archive checksum verified.');
    }

    // 3. Post-Restore DB Telemetry Verification (if live restore against target)
    let restoredTablesCount: number | undefined;
    let vectorExtensionVerified: boolean | undefined;

    if (!isDryRun && options.targetDatabaseUrl) {
      const client = new Client({ connectionString: options.targetDatabaseUrl });
      try {
        await client.connect();
        const tablesRes = await client.query(
          "SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'",
        );
        restoredTablesCount = parseInt(tablesRes.rows[0]?.count || '0', 10);
        console.log(`✓ Restored public tables count: ${restoredTablesCount}`);
        const minExpected = options.expectedMinimumTables ?? 1;
        if (restoredTablesCount < minExpected) {
          throw new Error(
            `RESTORE_VERIFICATION_FAILED: Restored public table count (${restoredTablesCount}) is below expected minimum (${minExpected}).`,
          );
        }

        const extRes = await client.query(
          "SELECT count(*) as count FROM pg_extension WHERE extname = 'vector'",
        );
        vectorExtensionVerified = parseInt(extRes.rows[0]?.count || '0', 10) > 0;
        console.log(`✓ Vector extension status: ${vectorExtensionVerified ? 'INSTALLED' : 'NOT FOUND'}`);
      } finally {
        await client.end().catch(() => {});
      }
    }

    // 4. Post-Backup File Reconciliation:
    const backupDate = new Date(manifest.timestamp).getTime();
    const orphanFilePaths: string[] = [];

    const checkDirs = ['uploads', 'storage'].map((d) => path.resolve(process.cwd(), d));
    for (const cDir of checkDirs) {
      if (fs.existsSync(cDir)) {
        const files = fs.readdirSync(cDir);
        for (const file of files) {
          const fullPath = path.join(cDir, file);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.mtimeMs > backupDate) {
              orphanFilePaths.push(fullPath);
            }
          } catch {
            // Skip inaccessible file
          }
        }
      }
    }

    if (orphanFilePaths.length > 0) {
      console.warn(
        `[AETHER Restore] Notice: ${orphanFilePaths.length} files were created after the backup timestamp (${manifest.timestamp}).`,
      );
      const reconciliationLog = path.join(backupDir, 'post_backup_orphan_reconciliation.json');
      fs.writeFileSync(reconciliationLog, JSON.stringify({ backupTimestamp: manifest.timestamp, orphanFilePaths }, null, 2));
    } else {
      console.log('✓ Post-backup upload inspection clean: 0 orphan files detected.');
    }

    return {
      valid: true,
      manifest,
      checksumsMatch: true,
      postBackupOrphanFilesDetected: orphanFilePaths.length,
      orphanFilePaths,
      dryRun: isDryRun,
      restoredTablesCount,
      vectorExtensionVerified,
    };
  } finally {
    if (decryptedTempFile && fs.existsSync(decryptedTempFile) && !options.keepDecryptedDump) {
      try {
        fs.unlinkSync(decryptedTempFile);
      } catch {
        // Ignore
      }
    }
  }
};

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('restore.ts')) {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.error('Usage: tsx scripts/restore.ts <backup_directory_path> [--confirm-non-production] [--target-url <url>]');
    process.exit(1);
  }
  const isConfirmed = process.argv.includes('--confirm-non-production');
  const allowUnsigned = process.argv.includes('--allow-unsigned-manifest');
  const targetUrlIdx = process.argv.indexOf('--target-url');
  const targetUrl = targetUrlIdx !== -1 ? process.argv[targetUrlIdx + 1] : undefined;
  const hmacSecretIdx = process.argv.indexOf('--hmac-secret');
  const cliHmacSecret = hmacSecretIdx !== -1 ? process.argv[hmacSecretIdx + 1] : undefined;

  verifyAndReconcileRestore(targetDir, {
    isDryRun: !isConfirmed,
    confirmNonProduction: isConfirmed,
    targetDatabaseUrl: targetUrl,
    hmacSecret: cliHmacSecret,
    allowUnsignedLegacy: allowUnsigned,
  })
    .then((res) => {
      console.log('✓ Recovery verification completed successfully:', res);
    })
    .catch((err) => {
      console.error('❌ Recovery verification failed:', err.message);
      process.exit(1);
    });
}
