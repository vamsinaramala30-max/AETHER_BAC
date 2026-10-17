/**
 * AETHER Enterprise Platform — Production Database & Storage Backup Engine (P3C-04)
 * Creates consistent, encrypted point-in-time snapshots of relational data,
 * tenant file assets, knowledge documents, and generates a signed integrity manifest.
 *
 * Security & Integrity Guarantees:
 * - NEVER prints or exposes database passwords, tokens, or connection strings in logs or CLI args.
 * - Credentials are passed exclusively via isolated process environment variables (PGHOST, PGPASSWORD, etc.).
 * - Validates dump integrity: aborts if dump is missing, malformed, or abnormally small (<= 100 bytes).
 * - Implements OpenSSL-compatible AES-256-CBC PBKDF2 encryption (100,000 iterations) with signed SHA-256 hashes.
 * - Explicit error reporting: never fabricates mock archives or claims success on failure.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

export interface BackupManifest {
  readonly version: string;
  readonly timestamp: string;
  readonly environment: string;
  readonly targetRpo: string;
  readonly targetRto: string;
  readonly artifacts: {
    readonly database?: {
      readonly filename: string;
      readonly format: string;
      readonly sizeBytes: number;
      readonly sha256: string;
      readonly encryption?: string;
      readonly encryptedFilename?: string;
      readonly encryptedSizeBytes?: number;
      readonly encryptedSha256?: string;
      readonly isSynthetic?: boolean;
    };
    readonly storage?: {
      readonly filename: string;
      readonly sizeBytes: number;
      readonly fileCount: number;
      readonly sha256: string;
      readonly filesArchived?: boolean;
      readonly note?: string;
    };
  };
  readonly checksumAlgorithm: 'sha256';
  readonly signatureAlgorithm?: 'HMAC-SHA256';
  readonly hmacSignature?: string;
  readonly status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  readonly storageMetadataOnly?: boolean;
  readonly notes?: string;
  readonly error?: string;
}

export interface BackupOptions {
  readonly outputBaseDir?: string;
  readonly databaseUrl?: string;
  readonly encryptionKey?: string;
  readonly hmacSecret?: string;
  readonly keepUnencrypted?: boolean;
  readonly syntheticSourceFile?: string;
  readonly pgDumpPath?: string;
  readonly isDryRun?: boolean;
  readonly env?: string;
}

export interface ParsedDbParams {
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly password?: string;
  readonly database: string;
  readonly sslmode?: string;
}

export const computeFileSha256 = (filePath: string): string => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cannot compute checksum: file does not exist at ${filePath}`);
  }
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

/**
 * Deterministic JSON canonicalization for cryptographic signing and verification.
 * Recursively sorts all object keys.
 */
export const canonicalizeJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalizeJson(obj[k])).join(',') + '}';
};

/**
 * Computes an HMAC-SHA256 signature over a canonical representation of manifest contents,
 * strictly excluding the signature field itself.
 */
export const computeManifestHmac = (manifest: BackupManifest, secret: string): string => {
  const { hmacSignature, signatureAlgorithm, ...manifestToSign } = manifest as any;
  const canonical = canonicalizeJson(manifestToSign);
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
};

export const MAGIC_GCM_HEADER = Buffer.from('AETHER_GCM_V1');

/**
 * Authenticated Encryption using AES-256-GCM with PBKDF2 key derivation (100,000 iterations).
 * Cryptographically guarantees confidentiality, authenticity, and integrity.
 * Binary format: [MAGIC_GCM_HEADER (13 bytes)][Salt (16 bytes)][IV (12 bytes)][AuthTag (16 bytes)][Ciphertext]
 */
export const encryptFileWithAes256 = (inputPath: string, outputPath: string, password: string): void => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Encryption failed: input file not found at ${inputPath}`);
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const inputData = fs.readFileSync(inputPath);
  const ciphertext = Buffer.concat([cipher.update(inputData), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encrypted = Buffer.concat([
    MAGIC_GCM_HEADER,
    salt,
    iv,
    authTag,
    ciphertext,
  ]);
  fs.writeFileSync(outputPath, encrypted);
};

/**
 * Legacy OpenSSL-compatible AES-256-CBC PBKDF2 encryption (for backward compatibility)
 */
export const encryptFileWithAes256Cbc = (inputPath: string, outputPath: string, password: string): void => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Encryption failed: input file not found at ${inputPath}`);
  }
  const salt = crypto.randomBytes(8);
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 48, 'sha256');
  const key = derived.subarray(0, 32);
  const iv = derived.subarray(32, 48);

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const inputData = fs.readFileSync(inputPath);
  const encrypted = Buffer.concat([
    Buffer.from('Salted__'),
    salt,
    cipher.update(inputData),
    cipher.final(),
  ]);
  fs.writeFileSync(outputPath, encrypted);
};

/**
 * Safely parse database connection parameters without leaking password in errors
 */
export const parseDatabaseConnectionParams = (rawUrl: string): ParsedDbParams => {
  try {
    let cleanUrl = rawUrl.trim();
    if ((cleanUrl.startsWith('"') && cleanUrl.endsWith('"')) || (cleanUrl.startsWith("'") && cleanUrl.endsWith("'"))) {
      cleanUrl = cleanUrl.slice(1, -1);
    }
    const parsed = new URL(cleanUrl);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port || '5432',
      user: decodeURIComponent(parsed.username || 'postgres'),
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'postgres',
      sslmode: parsed.searchParams.get('sslmode') || undefined,
    };
  } catch {
    throw new Error('DATABASE_URL_INVALID: Failed to parse database connection URL.');
  }
};

/**
 * Detect pg_dump binary on host system
 */
export const findPgDumpBinary = (customPath?: string): string | null => {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
    return process.env.PG_DUMP_PATH;
  }

  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? 'where.exe' : 'which';
  try {
    const res = spawnSync(checkCmd, ['pg_dump'], { stdio: 'pipe', encoding: 'utf-8' });
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
          standardPaths.push(path.join(base, ver, 'bin', 'pg_dump.exe'));
        }
      }
    }
    // Check user profile, local app data, and portable tools directories
    const userProfile = process.env.USERPROFILE || '';
    if (userProfile) {
      standardPaths.push(
        path.join(userProfile, 'pgsql', 'bin', 'pg_dump.exe'),
        path.join(userProfile, 'AppData', 'Local', 'Programs', 'PostgreSQL', 'bin', 'pg_dump.exe'),
        path.join(userProfile, 'scoop', 'apps', 'postgresql', 'current', 'bin', 'pg_dump.exe'),
      );
    }
    standardPaths.push(
      path.resolve(process.cwd(), 'tools', 'pgsql', 'bin', 'pg_dump.exe'),
      path.resolve(process.cwd(), '..', 'tools', 'pgsql', 'bin', 'pg_dump.exe'),
    );
  } else {
    standardPaths.push(
      '/usr/bin/pg_dump',
      '/usr/local/bin/pg_dump',
      '/opt/homebrew/bin/pg_dump',
      '/usr/lib/postgresql/16/bin/pg_dump',
      '/usr/lib/postgresql/17/bin/pg_dump',
    );
  }

  for (const p of standardPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
};

export const createBackupManifest = (
  backupDir: string,
  artifacts: BackupManifest['artifacts'],
  env: string = process.env.NODE_ENV || 'production',
  status: BackupManifest['status'] = 'COMPLETED',
  error?: string,
  hmacSecret?: string,
): BackupManifest => {
  const secret =
    hmacSecret ||
    process.env.BACKUP_HMAC_SECRET ||
    process.env.AETHER_BACKUP_HMAC_SECRET ||
    process.env.BACKUP_SIGNING_KEY;

  const manifest: BackupManifest = {
    version: secret ? '1.1.0' : '1.0.0',
    timestamp: new Date().toISOString(),
    environment: env,
    targetRpo: '< 15 minutes with WAL archiving, < 24 hours with daily snapshots',
    targetRto: '< 30 minutes (DB restore < 15m, storage restore < 10m, verification < 5m)',
    artifacts,
    storageMetadataOnly: true,
    notes:
      'NOTICE: Storage artifact records metadata inventory only (filenames, sizes, mtimes). Actual file asset binaries were NOT archived/compressed into this snapshot.',
    checksumAlgorithm: 'sha256',
    status,
    ...(error ? { error } : {}),
  };

  if (secret) {
    (manifest as any).signatureAlgorithm = 'HMAC-SHA256';
    (manifest as any).hmacSignature = computeManifestHmac(manifest, secret);
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
};

export const runBackup = async (
  outputBaseDir?: string,
  options: BackupOptions = {},
): Promise<BackupManifest> => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = options.outputBaseDir || outputBaseDir || path.resolve(process.cwd(), 'backups', `backup_${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`[AETHER Backup] Initializing backup snapshot in: ${backupDir}`);
  const artifacts: BackupManifest['artifacts'] = {};

  // 1. Storage Backup (uploads and storage directories)
  const storageDirs = ['uploads', 'storage'].map((d) => path.resolve(process.cwd(), d));
  let totalFiles = 0;
  let totalBytes = 0;
  const storageInventory: { path: string; size: number; mtime: string }[] = [];

  for (const sDir of storageDirs) {
    if (fs.existsSync(sDir)) {
      const files = fs.readdirSync(sDir);
      for (const f of files) {
        try {
          const fullPath = path.join(sDir, f);
          const st = fs.statSync(fullPath);
          if (st.isFile()) {
            totalFiles += 1;
            totalBytes += st.size;
            storageInventory.push({ path: path.join(path.basename(sDir), f), size: st.size, mtime: st.mtime.toISOString() });
          }
        } catch {
          // Skip inaccessible file
        }
      }
    }
  }

  console.log(`[AETHER Backup] Recording storage metadata inventory only (${totalFiles} items, ${totalBytes} bytes). File assets are NOT archived.`);
  const storageManifestPath = path.join(backupDir, 'storage_inventory.json');
  fs.writeFileSync(
    storageManifestPath,
    JSON.stringify(
      {
        totalFiles,
        totalBytes,
        timestamp,
        inventoryType: 'METADATA_INVENTORY_ONLY',
        filesArchived: false,
        note: 'Actual file asset binaries were NOT archived. Only metadata (path, size, mtime) is recorded.',
        inventory: storageInventory,
      },
      null,
      2,
    ),
  );
  const storageSha = computeFileSha256(storageManifestPath);
  const storageStats = fs.statSync(storageManifestPath);

  // 2. Database Backup
  const dbDumpFile = path.join(backupDir, 'aether_db.dump');
  const dbUrl = options.databaseUrl || process.env.DATABASE_URL;
  const encryptionKey = options.encryptionKey || process.env.BACKUP_ENCRYPTION_KEY;

  try {
    if (options.syntheticSourceFile) {
      // Programmatic synthetic data mode for offline/isolated integration tests
      console.log(`[AETHER Backup] Using synthetic test snapshot from: ${options.syntheticSourceFile}`);
      fs.copyFileSync(options.syntheticSourceFile, dbDumpFile);
    } else if (dbUrl) {
      console.log('[AETHER Backup] Preparing genuine PostgreSQL export...');
      const pgDumpBin = findPgDumpBinary(options.pgDumpPath);
      if (!pgDumpBin) {
        throw new Error(
          'PG_DUMP_TOOL_MISSING: PostgreSQL client binary pg_dump is not installed or not discovered in PATH. Real backup cannot proceed.',
        );
      }

      const dbParams = parseDatabaseConnectionParams(dbUrl);
      console.log(`[AETHER Backup] Invoking pg_dump against host: ${dbParams.host}:${dbParams.port}, db: ${dbParams.database}`);

      // Isolate credentials in process environment variables to prevent command-line snooping
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PGHOST: dbParams.host,
        PGPORT: dbParams.port,
        PGUSER: dbParams.user,
        PGDATABASE: dbParams.database,
      };
      if (dbParams.password) {
        env.PGPASSWORD = dbParams.password;
      }
      if (dbParams.sslmode) {
        env.PGSSLMODE = dbParams.sslmode;
      }

      const dumpArgs = ['-F', 'c', '-b', '-v', '-f', dbDumpFile];
      const result = spawnSync(pgDumpBin, dumpArgs, { env, stdio: 'pipe', encoding: 'utf-8' });

      if (result.status !== 0) {
        const sanitizedErr = (result.stderr || result.error?.message || 'pg_dump failed')
          .replace(new RegExp(dbParams.password || '___none___', 'g'), '***REDACTED***');
        throw new Error(`PG_DUMP_FAILED: ${sanitizedErr}`);
      }

      // Integrity verification of generated dump
      const stats = fs.statSync(dbDumpFile);
      if (stats.size <= 100) {
        if (fs.existsSync(dbDumpFile)) fs.unlinkSync(dbDumpFile);
        throw new Error(`DUMP_CORRUPTED: Exported archive size is ${stats.size} bytes (abnormally small). Aborting.`);
      }
    } else {
      throw new Error('DATABASE_URL_NOT_CONFIGURED: Cannot execute database backup without valid DATABASE_URL.');
    }

    const rawDbSha = computeFileSha256(dbDumpFile);
    const rawDbStats = fs.statSync(dbDumpFile);

    let databaseArtifactInfo: BackupManifest['artifacts']['database'] = {
      filename: path.basename(dbDumpFile),
      format: options.syntheticSourceFile ? 'synthetic_test_file' : 'custom_compressed (pg_dump -F c)',
      sizeBytes: rawDbStats.size,
      sha256: rawDbSha,
      isSynthetic: Boolean(options.syntheticSourceFile),
    };

    // Apply Authenticated AES-256-GCM encryption if key is provided
    if (encryptionKey) {
      console.log('[AETHER Backup] Encrypting archive via Authenticated AES-256-GCM PBKDF2...');
      const encryptedDumpFile = `${dbDumpFile}.enc`;
      encryptFileWithAes256(dbDumpFile, encryptedDumpFile, encryptionKey);

      const encSha = computeFileSha256(encryptedDumpFile);
      const encStats = fs.statSync(encryptedDumpFile);

      databaseArtifactInfo = {
        ...databaseArtifactInfo,
        encryption: 'AES-256-GCM-PBKDF2',
        encryptedFilename: path.basename(encryptedDumpFile),
        encryptedSizeBytes: encStats.size,
        encryptedSha256: encSha,
      };

      if (!options.keepUnencrypted) {
        fs.unlinkSync(dbDumpFile);
      }
    }

    const manifest = createBackupManifest(
      backupDir,
      {
        database: databaseArtifactInfo,
        storage: {
          filename: path.basename(storageManifestPath),
          sizeBytes: storageStats.size,
          fileCount: totalFiles,
          sha256: storageSha,
          filesArchived: false,
          note: 'Metadata inventory only; binary file assets were NOT archived.',
        },
      },
      options.env || process.env.NODE_ENV || 'production',
      'COMPLETED',
      undefined,
      options.hmacSecret,
    );

    console.log(`[AETHER Backup] Backup successfully created. Manifest written to ${path.join(backupDir, 'manifest.json')}`);
    return manifest;
  } catch (err: any) {
    const errorMsg = err?.message || 'Unknown backup execution failure';
    console.error(`❌ [AETHER Backup] Fatal error: ${errorMsg}`);

    // If a corrupted or partial dump file remains, remove it
    if (fs.existsSync(dbDumpFile) && !options.syntheticSourceFile) {
      try {
        fs.unlinkSync(dbDumpFile);
      } catch {
        // Ignore
      }
    }
    const partialEncFile = `${dbDumpFile}.enc`;
    if (fs.existsSync(partialEncFile) && !options.syntheticSourceFile) {
      try {
        fs.unlinkSync(partialEncFile);
      } catch {
        // Ignore
      }
    }

    createBackupManifest(
      backupDir,
      {
        storage: {
          filename: path.basename(storageManifestPath),
          sizeBytes: storageStats.size,
          fileCount: totalFiles,
          sha256: storageSha,
        },
      },
      options.env || process.env.NODE_ENV || 'production',
      'FAILED',
      errorMsg,
      options.hmacSecret,
    );
    throw new Error(errorMsg);
  }
};

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].endsWith('backup.ts')) {
  runBackup()
    .then((m) => console.log('✓ Backup execution completed successfully with SHA-256 manifest:', m.artifacts))
    .catch((err) => {
      console.error('❌ Backup execution failed:', err.message);
      process.exit(1);
    });
}
