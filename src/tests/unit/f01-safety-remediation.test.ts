/**
 * AETHER Autonomous Platform — F-01 Safety Remediation Unit Test Suite
 * Validates database isolation, test scoping, checksum integrity verification,
 * destructive script neutralization, manifest authenticity, and fail-closed gates in complete isolation.
 *
 * ZERO network calls. ZERO production credentials. ZERO database dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as childProcess from 'child_process';
import { spawnSync, execSync } from 'child_process';
import { validateDisposableTestDatabaseUrl } from '../helpers/test-db-guard.js';
import {
  computeFileSha256,
  createBackupManifest,
  runBackup,
  encryptFileWithAes256,
  canonicalizeJson,
  computeManifestHmac,
} from '../../../scripts/backup.js';
import {
  verifyAndReconcileRestore,
  verifyManifestAuthenticity,
} from '../../../scripts/restore.js';
import {
  validateSafeDbReset,
  runSafeDbReset,
  sanitizeCredentials as sanitizeResetCredentials,
} from '../../../scripts/safe-db-reset.js';
import {
  validateMigrationTarget,
  sanitizeCredentials,
  runSafeMigrationGate,
} from '../../../scripts/deploy-migrations.js';

describe('AETHER Phase 1 — F-01 Safety Remediation Verification Suite', () => {
  let tempTestDir: string;
  const testMasterKey = 'AetherSafeDrVerificationKey2026!#';
  const testHmacSecret = 'AetherManifestHmacSecretKey2026!@#$';

  beforeEach(() => {
    tempTestDir = path.join(
      os.tmpdir(),
      `aether_f01_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    );
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ============================================================================
  // 1. Vitest Discovery Configuration Scoping (Fix 1)
  // ============================================================================
  describe('1. Unit-Test Discovery Excludes Database Integration Tests', () => {
    it('verifies vitest.config.ts restricts include and excludes integration & database-dependent tests', () => {
      const configPath = path.resolve(process.cwd(), 'vitest.config.ts');
      expect(fs.existsSync(configPath)).toBe(true);

      const configContent = fs.readFileSync(configPath, 'utf-8');
      expect(configContent).toContain("include: ['src/tests/unit/**/*.test.ts']");
      expect(configContent).toContain("'src/tests/integration/**'");
      expect(configContent).toContain("'**/stage3-schema-persistence-verification.test.ts'");
      expect(configContent).toContain("'**/*.integration.test.ts'");
      expect(configContent).toContain("'**/action-planning-e2e.test.ts'");
      expect(configContent).toContain("'**/streaming-tools-e2e.test.ts'");
      expect(configContent).toContain("'**/phase4-autonomous-execution.test.ts'");
      expect(configContent).toContain("'**/phase5-automation-scheduler.test.ts'");
      expect(configContent).toContain("'**/tools-controlled-actions.test.ts'");
    });
  });

  // ============================================================================
  // 2. Database Integration Test Guard
  // ============================================================================
  describe('2. Database Integration Tests Refuse Unsafe / Implicit Targets', () => {
    it('refuses when DISPOSABLE_TEST_DATABASE_URL is undefined or empty', () => {
      expect(validateDisposableTestDatabaseUrl(undefined).isAllowed).toBe(false);
      expect(validateDisposableTestDatabaseUrl('').isAllowed).toBe(false);
      expect(validateDisposableTestDatabaseUrl('   ').isAllowed).toBe(false);
      expect(validateDisposableTestDatabaseUrl(undefined).reason).toContain(
        'DISPOSABLE_TEST_DATABASE_URL is not set',
      );
    });

    it('refuses invalid URL formats or non-postgresql protocols', () => {
      const resFormat = validateDisposableTestDatabaseUrl('not-a-valid-url');
      expect(resFormat.isAllowed).toBe(false);
      expect(resFormat.reason).toContain('not a valid PostgreSQL URL format');

      const resHttp = validateDisposableTestDatabaseUrl('https://localhost:5432/mydb');
      expect(resHttp.isAllowed).toBe(false);
      expect(resHttp.reason).toContain('Invalid protocol');
    });

    it('strictly rejects remote Supabase cloud hostnames', () => {
      const supabaseUrl =
        'postgresql://postgres:SecretPassword123@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';
      const result = validateDisposableTestDatabaseUrl(supabaseUrl);
      expect(result.isAllowed).toBe(false);
      expect(result.reason).toContain('strictly prohibit remote/production cloud targets');
    });

    it('strictly rejects remote AWS RDS and cloud production hostnames', () => {
      const rdsUrl = 'postgresql://admin:SecretPass@mydb.rds.amazonaws.com:5432/production';
      const result = validateDisposableTestDatabaseUrl(rdsUrl);
      expect(result.isAllowed).toBe(false);
      expect(result.reason).toContain('strictly prohibit remote/production cloud targets');
    });

    it('strictly rejects non-localhost domain names', () => {
      const remoteUrl = 'postgresql://postgres:secret@custom-postgres.org:5432/testdb';
      const result = validateDisposableTestDatabaseUrl(remoteUrl);
      expect(result.isAllowed).toBe(false);
      expect(result.reason).toContain('Only localhost or 127.0.0.1 are permitted');
    });

    it('permits authorized local disposable database targets', () => {
      const localIp = 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test';
      const resIp = validateDisposableTestDatabaseUrl(localIp);
      expect(resIp.isAllowed).toBe(true);
      expect(resIp.host).toBe('127.0.0.1');
      expect(resIp.port).toBe('5433');

      const localhost = 'postgresql://postgres:postgres@localhost:5432/aether_test';
      const resHost = validateDisposableTestDatabaseUrl(localhost);
      expect(resHost.isAllowed).toBe(true);
      expect(resHost.host).toBe('localhost');
      expect(resHost.port).toBe('5432');
    });
  });

  // ============================================================================
  // 3. Restore Checksum Verification Order & Shell Restore Gate (Fix 3)
  // ============================================================================
  describe('3. Restore Rejects Missing or Mismatched Checksum Before Invoking Decryption or pg_restore', () => {
    it('rejects restore when database SHA-256 is missing in manifest', async () => {
      const sampleDump = path.join(tempTestDir, 'aether_db.dump');
      fs.writeFileSync(sampleDump, 'DUMP SAMPLE CONTENT FOR RESTORE TEST');

      const manifestPath = path.join(tempTestDir, 'manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          environment: 'test',
          artifacts: {
            database: {
              filename: 'aether_db.dump',
              format: 'custom_compressed',
              sizeBytes: 100,
              sha256: '', // MISSING CHECKSUM
            },
          },
          status: 'COMPLETED',
        }),
      );

      await expect(
        verifyAndReconcileRestore(tempTestDir, { isDryRun: true, allowUnsignedLegacy: true }),
      ).rejects.toThrow('INTEGRITY_VIOLATION: Manifest is missing required database SHA-256 checksum.');
    });

    it('rejects restore when raw database dump checksum does not match manifest', async () => {
      const sampleDump = path.join(tempTestDir, 'aether_db.dump');
      fs.writeFileSync(sampleDump, 'AUTHENTIC CONTENT FOR CHECKSUM TEST');

      createBackupManifest(tempTestDir, {
        database: {
          filename: 'aether_db.dump',
          format: 'custom_compressed',
          sizeBytes: 100,
          sha256: '0000000000000000000000000000000000000000000000000000000000000000', // Intentional mismatch
        },
      });

      await expect(
        verifyAndReconcileRestore(tempTestDir, { isDryRun: true, allowUnsignedLegacy: true }),
      ).rejects.toThrow(/INTEGRITY_VIOLATION: Database checksum mismatch/);
    });

    it('rejects restore when encrypted archive is missing encryptedSha256 before decryption', async () => {
      const sampleDump = path.join(tempTestDir, 'aether_db.dump');
      fs.writeFileSync(sampleDump, 'CONTENT REQUIRING ENCRYPTION');
      const sampleSha = computeFileSha256(sampleDump);

      const encDump = path.join(tempTestDir, 'aether_db.dump.enc');
      encryptFileWithAes256(sampleDump, encDump, testMasterKey);
      fs.unlinkSync(sampleDump);

      createBackupManifest(tempTestDir, {
        database: {
          filename: 'aether_db.dump',
          format: 'custom_compressed',
          sizeBytes: 100,
          sha256: sampleSha,
          encryption: 'AES-256-GCM-PBKDF2',
          encryptedFilename: 'aether_db.dump.enc',
          encryptedSizeBytes: fs.statSync(encDump).size,
          // encryptedSha256 omitted
        },
      });

      await expect(
        verifyAndReconcileRestore(tempTestDir, {
          isDryRun: true,
          encryptionKey: testMasterKey,
          allowUnsignedLegacy: true,
        }),
      ).rejects.toThrow(/INTEGRITY_VIOLATION: Manifest is missing required encrypted database archive SHA-256 checksum/);
    });

    it('rejects restore when encrypted archive checksum does not match manifest before decryption', async () => {
      const sampleDump = path.join(tempTestDir, 'aether_db.dump');
      fs.writeFileSync(sampleDump, 'GENUINE TEST SNAPSHOT CONTENT');
      const sampleSha = computeFileSha256(sampleDump);

      const encDump = path.join(tempTestDir, 'aether_db.dump.enc');
      encryptFileWithAes256(sampleDump, encDump, testMasterKey);
      fs.unlinkSync(sampleDump);

      createBackupManifest(tempTestDir, {
        database: {
          filename: 'aether_db.dump',
          format: 'custom_compressed',
          sizeBytes: 100,
          sha256: sampleSha,
          encryption: 'AES-256-GCM-PBKDF2',
          encryptedFilename: 'aether_db.dump.enc',
          encryptedSizeBytes: fs.statSync(encDump).size,
          encryptedSha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', // Wrong encrypted SHA
        },
      });

      await expect(
        verifyAndReconcileRestore(tempTestDir, {
          isDryRun: true,
          encryptionKey: testMasterKey,
          allowUnsignedLegacy: true,
        }),
      ).rejects.toThrow(/INTEGRITY_VIOLATION: Encrypted database archive checksum mismatch/);
    });

    it('verifies restore-db.sh shell script validates pre-decryption checksum and fails closed', () => {
      const scriptPath = path.resolve(process.cwd(), 'scripts/restore-db.sh');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
      // Verifies encryptedSha256 is checked before openssl enc -d
      const encShaPos = scriptContent.indexOf('EXPECTED_ENC_SHA');
      const opensslPos = scriptContent.indexOf('openssl enc -d');
      expect(encShaPos).toBeGreaterThan(-1);
      expect(opensslPos).toBeGreaterThan(-1);
      expect(encShaPos).toBeLessThan(opensslPos);

      // Verifies pg_restore is unreachable after failed check
      expect(scriptContent).toContain('set -euo pipefail');
      expect(scriptContent).toContain('FATAL: INTEGRITY_VIOLATION: Encrypted database archive checksum mismatch!');
    });
  });

  // ============================================================================
  // 4. Destructive Database Reset Explicit Target Enforcement (Fix 2)
  // ============================================================================
  describe('4. Destructive Database Scripts Refuse Unsafe or Implicit Targets', () => {
    describe('safe-db-reset guard', () => {
      it('refuses reset in production environment (NODE_ENV=production)', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'production',
          argv: ['--confirm-destructive-reset', '--target-url', 'postgresql://postgres:postgres@127.0.0.1:5432/mydb'],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('strictly prohibited in production environment');
      });

      it('refuses reset without explicit --confirm-destructive-reset flag', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'development',
          argv: ['--target-url', 'postgresql://postgres:postgres@127.0.0.1:5432/mydb'],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain(
          "requires explicit confirmation flag '--confirm-destructive-reset'",
        );
      });

      it('refuses reset when target URL is missing, even with confirmation flag', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'development',
          argv: ['--confirm-destructive-reset'],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('No disposable database target URL provided for reset');
      });

      it('strictly ignores ambient DATABASE_URL in process.env and refuses reset without explicit target', () => {
        const prevUrl = process.env.DATABASE_URL;
        process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/local_dev_db';

        try {
          const res = validateSafeDbReset({
            nodeEnv: 'development',
            argv: ['--confirm-destructive-reset'],
          });
          expect(res.isAllowed).toBe(false);
          expect(res.reason).toContain('Fallback to ambient DATABASE_URL is strictly prohibited');
        } finally {
          if (prevUrl) process.env.DATABASE_URL = prevUrl;
          else delete process.env.DATABASE_URL;
        }
      });

      it('refuses reset when target URL is malformed', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'development',
          argv: ['--confirm-destructive-reset', '--target-url', 'not-a-valid-url'],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('not a valid PostgreSQL URL format');
      });

      it('refuses reset when protocol is not postgresql or postgres', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'development',
          argv: ['--confirm-destructive-reset', '--target-url', 'https://127.0.0.1:5432/mydb'],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('Invalid protocol');
      });

      it('refuses reset targeting remote Supabase database even with confirmation', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'development',
          argv: [
            '--confirm-destructive-reset',
            '--target-url',
            'postgresql://postgres:Secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
          ],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain(
          'Resetting remote or production databases is strictly prohibited',
        );
      });

      it('refuses reset targeting remote RDS or cloud hosts even with confirmation', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'development',
          argv: [
            '--confirm-destructive-reset',
            '--target-url',
            'postgresql://admin:Secret@mydb.rds.amazonaws.com:5432/production',
          ],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain(
          'Resetting remote or production databases is strictly prohibited',
        );
      });

      it('refuses reset targeting arbitrary non-local hostnames', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'development',
          argv: [
            '--confirm-destructive-reset',
            '--target-url',
            'postgresql://postgres:secret@custom-host.external:5432/disposable',
          ],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('not an authorized local disposable target');
      });

      it('refuses reset when DIRECT_URL is explicitly empty', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: ['--confirm-destructive-reset'],
          targetUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
          directUrl: '',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('DIRECT_URL is missing or empty');
      });

      it('refuses reset when DIRECT_URL targets remote Supabase even with confirmation', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: ['--confirm-destructive-reset'],
          targetUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
          directUrl:
            'postgresql://postgres:Secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('matches forbidden pattern');
      });

      it('refuses reset when target and direct hosts are mismatched', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: ['--confirm-destructive-reset'],
          targetUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
          directUrl: 'postgresql://postgres:postgres@localhost:5433/aether_disposable',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('do not match');
      });

      it('refuses reset when target and direct ports are mismatched', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: ['--confirm-destructive-reset'],
          targetUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
          directUrl: 'postgresql://postgres:postgres@127.0.0.1:5432/aether_disposable',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('do not match');
      });

      it('refuses reset when target and direct databases are mismatched', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: ['--confirm-destructive-reset'],
          targetUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
          directUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/other_disposable',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('do not match');
      });

      it('permits reset when confirmation is supplied and both target and direct URLs match local disposable target', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: [
            '--confirm-destructive-reset',
            '--target-url',
            'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
            '--direct-url',
            'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
          ],
        });
        expect(res.isAllowed).toBe(true);
        expect(res.safeTargetUrl).toBe(
          'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
        );
        expect(res.safeDirectUrl).toBe(
          'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
        );
      });

      it('permits reset when confirmation is supplied and target is explicit local disposable via --target-url', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: [
            '--confirm-destructive-reset',
            '--target-url',
            'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
          ],
        });
        expect(res.isAllowed).toBe(true);
        expect(res.safeTargetUrl).toBe(
          'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
        );
        expect(res.safeDirectUrl).toBe(
          'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable',
        );
      });

      it('permits reset when confirmation is supplied and target is explicit local disposable via DISPOSABLE_RESET_DATABASE_URL', () => {
        const res = validateSafeDbReset({
          nodeEnv: 'test',
          argv: ['--confirm-destructive-reset'],
          disposableResetDatabaseUrl: 'postgresql://postgres:postgres@localhost:5432/aether_disposable_env',
        });
        expect(res.isAllowed).toBe(true);
        expect(res.safeTargetUrl).toBe(
          'postgresql://postgres:postgres@localhost:5432/aether_disposable_env',
        );
        expect(res.safeDirectUrl).toBe(
          'postgresql://postgres:postgres@localhost:5432/aether_disposable_env',
        );
      });
    });

    // ==========================================================================
    // 5. Migration Gate Must Fail Closed (Fix 5)
    // ==========================================================================
    describe('deploy-migrations release gate', () => {
      it('refuses migration unconditionally when database URL is missing or empty', () => {
        const resWithoutConfirm = validateMigrationTarget({
          databaseUrl: '',
          argv: [],
        });
        expect(resWithoutConfirm.isAllowed).toBe(false);
        expect(resWithoutConfirm.reason).toContain('Target database URL is missing or empty');

        const resWithConfirm = validateMigrationTarget({
          databaseUrl: '',
          confirmProductionMigration: true,
        });
        expect(resWithConfirm.isAllowed).toBe(false);
        expect(resWithConfirm.reason).toContain('Target database URL is missing or empty');
      });

      it('refuses migration unconditionally when database URL is malformed, even with confirmation flag', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'invalid://not a valid url',
          confirmProductionMigration: true,
          argv: ['--confirm-production-migration'],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('Target database URL is malformed');
      });

      it('refuses migration unconditionally when protocol is not postgresql or postgres', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'https://localhost:5432/mydb',
          confirmProductionMigration: true,
          argv: ['--confirm-production-migration'],
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('Invalid database protocol');
      });

      it('refuses migration when DIRECT_URL is missing or empty', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test',
          directUrl: '',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('Target DIRECT_URL is missing or empty');
      });

      it('refuses migration when DIRECT_URL is malformed', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test',
          directUrl: 'not_a_valid_url',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('Target DIRECT_URL is malformed');
      });

      it('refuses migration when DIRECT_URL protocol is not postgresql or postgres', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test',
          directUrl: 'http://127.0.0.1:5433/aether_disposable_test',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('Invalid DIRECT_URL protocol');
      });

      it('refuses migration when targeting remote Supabase, and confirmation flags cannot bypass target validation', () => {
        const resWithoutConfirm = validateMigrationTarget({
          databaseUrl:
            'postgresql://postgres:Secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
          directUrl:
            'postgresql://postgres:Secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
          argv: [],
        });
        expect(resWithoutConfirm.isAllowed).toBe(false);
        expect(resWithoutConfirm.isProduction).toBe(true);
        expect(resWithoutConfirm.reason).toContain('represents a remote/production environment');
        expect(resWithoutConfirm.reason).toContain('Confirmation flags cannot bypass target validation');

        const resWithConfirm = validateMigrationTarget({
          databaseUrl:
            'postgresql://postgres:Secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres',
          directUrl:
            'postgresql://postgres:Secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
          confirmProductionMigration: true,
          argv: ['--confirm-production-migration'],
        });
        expect(resWithConfirm.isAllowed).toBe(false);
        expect(resWithConfirm.isProduction).toBe(true);
        expect(resWithConfirm.reason).toContain('Confirmation flags cannot bypass target validation');
      });

      it('refuses migration when DIRECT_URL targets remote Supabase even if DATABASE_URL is local', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test',
          directUrl:
            'postgresql://postgres:Secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
          confirmProductionMigration: true,
        });
        expect(res.isAllowed).toBe(false);
        expect(res.isProduction).toBe(true);
        expect(res.reason).toContain('represents a remote/production environment');
      });

      it('refuses migration when DATABASE_URL and DIRECT_URL hosts are mismatched', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test',
          directUrl: 'postgresql://postgres:postgres@localhost:5433/aether_disposable_test',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('BLOCKED_MISMATCHED_TARGET');
        expect(res.reason).toContain('do not match');
      });

      it('refuses migration when DATABASE_URL and DIRECT_URL ports are mismatched', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test',
          directUrl: 'postgresql://postgres:postgres@127.0.0.1:5432/aether_disposable_test',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('BLOCKED_MISMATCHED_TARGET');
        expect(res.reason).toContain('do not match');
      });

      it('refuses migration when DATABASE_URL and DIRECT_URL database names are mismatched', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/aether_disposable_test',
          directUrl: 'postgresql://postgres:postgres@127.0.0.1:5433/other_db',
        });
        expect(res.isAllowed).toBe(false);
        expect(res.reason).toContain('BLOCKED_MISMATCHED_TARGET');
        expect(res.reason).toContain('do not match');
      });

      it('permits migration without confirmation when targeting localhost in development with matching local DIRECT_URL', () => {
        const res = validateMigrationTarget({
          databaseUrl: 'postgresql://postgres:postgres@localhost:5432/aether_dev',
          directUrl: 'postgresql://postgres:postgres@localhost:5432/aether_dev',
          nodeEnv: 'development',
          argv: [],
        });
        expect(res.isAllowed).toBe(true);
        expect(res.isProduction).toBe(false);
        expect(res.validatedDatabaseUrl).toBe(
          'postgresql://postgres:postgres@localhost:5432/aether_dev',
        );
        expect(res.validatedDirectUrl).toBe(
          'postgresql://postgres:postgres@localhost:5432/aether_dev',
        );
      });

      it('sanitizes credentials from passwords, query parameters, and tokens in error logs', () => {
        const rawErr =
          'Error connecting to postgresql://admin_user:SuperSecretPassword123@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require&apikey=sb_secret_token_99999';
        const sanitized = sanitizeCredentials(rawErr);
        expect(sanitized).not.toContain('SuperSecretPassword123');
        expect(sanitized).not.toContain('sb_secret_token_99999');
        expect(sanitized).toContain('postgresql://admin_user:***@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres');
        expect(sanitized).toContain('apikey=***');

        const standaloneTokens = 'Failed with password: topsecret and token=abc12345 and apikey=key_secret';
        const sanitizedTokens = sanitizeCredentials(standaloneTokens);
        expect(sanitizedTokens).not.toContain('topsecret');
        expect(sanitizedTokens).not.toContain('abc12345');
        expect(sanitizedTokens).not.toContain('key_secret');
      });
    });
  });

  // ============================================================================
  // 6. Manifest Authenticity & Cryptographic Binding (Fix 4)
  // ============================================================================
  describe('6. Manifest Authenticity & Cryptographic Binding (HMAC-SHA256)', () => {
    it('generates canonical representation independent of key insertion order', () => {
      const obj1 = { z: 1, a: 2, m: { b: 3, a: 4 } };
      const obj2 = { a: 2, m: { a: 4, b: 3 }, z: 1 };
      expect(canonicalizeJson(obj1)).toBe(canonicalizeJson(obj2));
      expect(canonicalizeJson(obj1)).toBe('{"a":2,"m":{"a":4,"b":3},"z":1}');
    });

    it('signs manifest with HMAC-SHA256 and verifies successfully with matching secret', () => {
      const manifest = createBackupManifest(
        tempTestDir,
        {
          database: {
            filename: 'aether_db.dump',
            format: 'custom_compressed',
            sizeBytes: 1234,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        },
        'test',
        'COMPLETED',
        undefined,
        testHmacSecret,
      );

      expect(manifest.version).toBe('1.1.0');
      expect(manifest.signatureAlgorithm).toBe('HMAC-SHA256');
      expect(manifest.hmacSignature).toBeDefined();
      expect(/^[0-9a-f]{64}$/.test(manifest.hmacSignature!)).toBe(true);

      const verifyResult = verifyManifestAuthenticity(manifest, testHmacSecret);
      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.isLegacy).toBe(false);
    });

    it('rejects manifest when metadata payload has been tampered with', () => {
      const manifest = createBackupManifest(
        tempTestDir,
        {
          database: {
            filename: 'aether_db.dump',
            format: 'custom_compressed',
            sizeBytes: 1000,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        },
        'test',
        'COMPLETED',
        undefined,
        testHmacSecret,
      );

      // Attacker tampers with the database checksum in the manifest
      const tamperedManifest = {
        ...manifest,
        artifacts: {
          ...manifest.artifacts,
          database: {
            ...manifest.artifacts.database!,
            sha256: 'tampered_sha256_checksum_value_0000000000000000000000000000000000',
          },
        },
      };

      expect(() => verifyManifestAuthenticity(tamperedManifest, testHmacSecret)).toThrow(
        /AUTHENTICATION_FAILED: Backup manifest HMAC signature verification failed/,
      );
    });

    it('rejects signed manifest when verified with an incorrect secret', () => {
      const manifest = createBackupManifest(
        tempTestDir,
        {
          database: {
            filename: 'aether_db.dump',
            format: 'custom_compressed',
            sizeBytes: 500,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        },
        'test',
        'COMPLETED',
        undefined,
        testHmacSecret,
      );

      expect(() => verifyManifestAuthenticity(manifest, 'WrongSecretKey12345!@#$%')).toThrow(
        /AUTHENTICATION_FAILED: Backup manifest HMAC signature verification failed/,
      );
    });

    it('rejects signed manifest when HMAC secret is omitted during verification', () => {
      const manifest = createBackupManifest(
        tempTestDir,
        {
          database: {
            filename: 'aether_db.dump',
            format: 'custom_compressed',
            sizeBytes: 500,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          },
        },
        'test',
        'COMPLETED',
        undefined,
        testHmacSecret,
      );

      const prevSecret = process.env.BACKUP_HMAC_SECRET;
      delete process.env.BACKUP_HMAC_SECRET;
      delete process.env.AETHER_BACKUP_HMAC_SECRET;
      delete process.env.BACKUP_SIGNING_KEY;

      try {
        expect(() => verifyManifestAuthenticity(manifest, undefined)).toThrow(
          /AUTHENTICATION_FAILED: Backup manifest contains an HMAC signature but no verification secret was supplied/,
        );
      } finally {
        if (prevSecret) process.env.BACKUP_HMAC_SECRET = prevSecret;
      }
    });

    it('rejects unsigned manifest for the new secure format (v1.1.0)', () => {
      const unsignedSecureManifest = {
        version: '1.1.0',
        timestamp: new Date().toISOString(),
        environment: 'test',
        targetRpo: 'test',
        targetRto: 'test',
        artifacts: {},
        checksumAlgorithm: 'sha256' as const,
        status: 'COMPLETED' as const,
      };

      expect(() => verifyManifestAuthenticity(unsignedSecureManifest, testHmacSecret)).toThrow(
        /SECURITY_VIOLATION: Unsigned manifest rejected for new secure format/,
      );
    });

    it('preserves backward compatibility: allows legacy unsigned v1.0.0 manifest with explicit warning in non-strict mode', () => {
      const legacyManifest = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: 'test',
        targetRpo: 'test',
        targetRto: 'test',
        artifacts: {},
        checksumAlgorithm: 'sha256' as const,
        status: 'COMPLETED' as const,
      };

      const result = verifyManifestAuthenticity(legacyManifest, undefined, {
        allowUnsignedLegacy: true,
      });
      expect(result.verified).toBe(false);
      expect(result.isLegacy).toBe(true);
    });
  });

  // ============================================================================
  // 7. Backup Metadata Accuracy
  // ============================================================================
  describe('7. Backup Metadata Accurately Describes What Was and Was Not Included', () => {
    it('accurately identifies synthetic snapshot and declares storage as metadata-only inventory', async () => {
      const syntheticSource = path.join(tempTestDir, 'synthetic_test.dump');
      fs.writeFileSync(syntheticSource, '-- SYNTHETIC DATABASE DUMP\nSELECT 1;');

      const manifest = await runBackup(tempTestDir, {
        syntheticSourceFile: syntheticSource,
        encryptionKey: testMasterKey,
        hmacSecret: testHmacSecret,
        outputBaseDir: tempTestDir,
        env: 'test',
      });

      // Status & Checksum
      expect(manifest.status).toBe('COMPLETED');
      expect(manifest.checksumAlgorithm).toBe('sha256');
      expect(manifest.signatureAlgorithm).toBe('HMAC-SHA256');
      expect(manifest.hmacSignature).toBeDefined();

      // Database artifact: accurately labeled as synthetic
      expect(manifest.artifacts.database).toBeDefined();
      expect(manifest.artifacts.database?.isSynthetic).toBe(true);
      expect(manifest.artifacts.database?.format).toBe('synthetic_test_file');
      expect(manifest.artifacts.database?.encryption).toBe('AES-256-GCM-PBKDF2');

      // Storage artifact: accurately declared as metadata inventory only, NOT archived files
      expect(manifest.storageMetadataOnly).toBe(true);
      expect(manifest.notes).toContain(
        'Storage artifact records metadata inventory only (filenames, sizes, mtimes)',
      );
      expect(manifest.notes).toContain('Actual file asset binaries were NOT archived/compressed');

      expect(manifest.artifacts.storage).toBeDefined();
      expect(manifest.artifacts.storage?.filesArchived).toBe(false);
      expect(manifest.artifacts.storage?.note).toContain('binary file assets were NOT archived');

      // Verify storage_inventory.json file on disk explicitly declares filesArchived: false
      const storageInventoryFile = path.join(tempTestDir, 'storage_inventory.json');
      expect(fs.existsSync(storageInventoryFile)).toBe(true);
      const inventoryJson = JSON.parse(fs.readFileSync(storageInventoryFile, 'utf-8'));
      expect(inventoryJson.inventoryType).toBe('METADATA_INVENTORY_ONLY');
      expect(inventoryJson.filesArchived).toBe(false);
      expect(inventoryJson.note).toContain('Actual file asset binaries were NOT archived');
    });
  });

  // ============================================================================
  // 8. Subprocess Execution Safety & Docker Isolation Guard (F-01 Safety Review Fixes)
  // ============================================================================
  describe('8. Subprocess Execution Safety & Docker Isolation Verification', () => {
    it('runSafeMigrationGate fails closed at Step 0 and skips all Prisma subprocesses when target validation fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const result = await runSafeMigrationGate({
          databaseUrl: 'invalid://malformed_url',
          directUrl: 'invalid://malformed_url',
        });
        expect(result.success).toBe(false);
        expect(result.schemaValid).toBe(false);
        expect(result.databaseConnected).toBe(false);
        expect(result.message).toContain('BLOCKED_INVALID_TARGET');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('BLOCKED_INVALID_TARGET'),
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it('runSafeDbReset fails closed and halts execution with exit code 1 when target validation fails', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null | undefined) => {
        throw new Error(`PROCESS_EXIT_${code}`);
      }) as any);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        expect(() => {
          runSafeDbReset({
            // Missing confirmation flag and invalid target
            nodeEnv: 'development',
            argv: [],
          });
        }).toThrow('PROCESS_EXIT_1');
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[AETHER SAFETY GUARD] DESTRUCTIVE DATABASE RESET BLOCKED'),
        );
      } finally {
        exitSpy.mockRestore();
        consoleErrorSpy.mockRestore();
      }
    });

    it('verifies Docker instructions in readiness report and runbook bind exclusively to 127.0.0.1 and use pgvector:pg16', () => {
      const readinessPath = path.resolve(
        process.cwd(),
        '..',
        'AETHER_F01_ISOLATED_VALIDATION_READINESS_REPORT.md',
      );
      const runbookPath = path.resolve(
        process.cwd(),
        '..',
        'AETHER_F01_REMEDIATION_RUNBOOK.md',
      );

      expect(fs.existsSync(readinessPath)).toBe(true);
      expect(fs.existsSync(runbookPath)).toBe(true);

      const readinessContent = fs.readFileSync(readinessPath, 'utf-8');
      const runbookContent = fs.readFileSync(runbookPath, 'utf-8');

      // Verify loopback port binding
      expect(readinessContent).toContain('-p 127.0.0.1:5433:5432');
      expect(runbookContent).toContain('-p 127.0.0.1:5433:5432');

      // Verify no insecure 0.0.0.0 port binding remains in active disposable instructions
      expect(readinessContent).not.toMatch(/docker run[^\n]* -p 5433:5432/);
      expect(runbookContent).not.toMatch(/docker run[^\n]* -p 5433:5432/);

      // Verify modern pgvector PostgreSQL 16 image is recommended
      expect(readinessContent).toContain('pgvector/pgvector:pg16');
      expect(runbookContent).toContain('pgvector/pgvector:pg16');

      // Verify non-interactive PGPASSWORD authentication is instructed
      expect(readinessContent).toContain('$env:PGPASSWORD = "disposable_recovery_password_2026"');
      expect(runbookContent).toContain('export PGPASSWORD="disposable_recovery_password_2026"');
    });
  });
});
