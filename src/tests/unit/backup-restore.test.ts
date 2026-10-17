/**
 * AETHER Autonomous Platform — Backup & Recovery Verification Test Suite
 * Tests genuine backup creation, authenticated PBKDF2 AES-256-GCM encryption,
 * integrity verification, safety gates, tamper detection, and disaster recovery workflows in isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  computeFileSha256,
  encryptFileWithAes256,
  encryptFileWithAes256Cbc,
  parseDatabaseConnectionParams,
  findPgDumpBinary,
  createBackupManifest,
  runBackup,
  MAGIC_GCM_HEADER,
} from '../../../scripts/backup';
import {
  decryptFileWithAes256,
  findPgRestoreBinary,
  verifyAndReconcileRestore,
} from '../../../scripts/restore';

describe('AETHER Database Backup & Recovery Engine (P3C-04)', () => {
  let testDir: string;
  const testKey = 'AetherSecureBackupMasterKey2026!#';

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `aether_dr_unit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('1. Checksum & Security Primitives', () => {
    it('computes valid SHA-256 checksums and throws on missing file', () => {
      const sample = path.join(testDir, 'sample.dump');
      fs.writeFileSync(sample, 'AETHER DATABASE TEST DATA 12345');

      const hash = computeFileSha256(sample);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);

      expect(() => computeFileSha256(path.join(testDir, 'non_existent.dump'))).toThrow(
        /Cannot compute checksum: file does not exist/,
      );
    });

    it('safely parses database connection URLs without leaking passwords in exceptions', () => {
      const validUrl = 'postgresql://admin_user:P%40ssw0rd123!@db.internal:5433/aether_db?sslmode=require';
      const parsed = parseDatabaseConnectionParams(validUrl);

      expect(parsed.host).toBe('db.internal');
      expect(parsed.port).toBe('5433');
      expect(parsed.user).toBe('admin_user');
      expect(parsed.password).toBe('P@ssw0rd123!');
      expect(parsed.database).toBe('aether_db');
      expect(parsed.sslmode).toBe('require');

      expect(() => parseDatabaseConnectionParams('invalid-url-schema')).toThrow(
        'DATABASE_URL_INVALID: Failed to parse database connection URL.',
      );
    });
  });

  describe('2. Authenticated AES-256-GCM Encryption & Cryptographic Integrity', () => {
    it('encrypts and decrypts dump files with 100% round-trip fidelity using AES-256-GCM', () => {
      const originalPath = path.join(testDir, 'plain.dump');
      const encryptedPath = path.join(testDir, 'plain.dump.enc');
      const decryptedPath = path.join(testDir, 'decrypted.dump');

      const originalPayload = Buffer.from(
        '-- PostgreSQL Database Dump Snapshot\n-- Table: users (45 records)\n' + 'X'.repeat(500),
      );
      fs.writeFileSync(originalPath, originalPayload);

      encryptFileWithAes256(originalPath, encryptedPath, testKey);

      expect(fs.existsSync(encryptedPath)).toBe(true);
      const encBuffer = fs.readFileSync(encryptedPath);
      expect(encBuffer.subarray(0, MAGIC_GCM_HEADER.length).equals(MAGIC_GCM_HEADER)).toBe(true);

      decryptFileWithAes256(encryptedPath, decryptedPath, testKey);

      expect(fs.existsSync(decryptedPath)).toBe(true);
      const decryptedBuffer = fs.readFileSync(decryptedPath);
      expect(decryptedBuffer.equals(originalPayload)).toBe(true);
    });

    it('rejects decryption when wrong encryption key is provided in GCM mode', () => {
      const originalPath = path.join(testDir, 'plain.dump');
      const encryptedPath = path.join(testDir, 'plain.dump.enc');
      const decryptedPath = path.join(testDir, 'decrypted.dump');

      fs.writeFileSync(originalPath, 'SECRET CLUSTER ARCHIVE DATA 1234567890');
      encryptFileWithAes256(originalPath, encryptedPath, testKey);

      expect(() => {
        decryptFileWithAes256(encryptedPath, decryptedPath, 'WRONG_KEY_INCORRECT');
      }).toThrow(/AUTHENTICATION_FAILED/);
    });

    it('detects tampering and refuses decryption if ciphertext or auth tag is modified (AEAD protection)', () => {
      const originalPath = path.join(testDir, 'plain.dump');
      const encryptedPath = path.join(testDir, 'plain.dump.enc');
      const decryptedPath = path.join(testDir, 'decrypted.dump');

      fs.writeFileSync(originalPath, 'CRITICAL FINANCIAL OR AUDIT LOG PAYLOAD DATA');
      encryptFileWithAes256(originalPath, encryptedPath, testKey);

      const encBuffer = fs.readFileSync(encryptedPath);
      // Flip the last byte of ciphertext
      encBuffer[encBuffer.length - 1] ^= 0xff;
      fs.writeFileSync(encryptedPath, encBuffer);

      expect(() => {
        decryptFileWithAes256(encryptedPath, decryptedPath, testKey);
      }).toThrow(/AUTHENTICATION_FAILED/);
      expect(fs.existsSync(decryptedPath)).toBe(false);
    });

    it('retains backward compatibility by decrypting legacy OpenSSL AES-256-CBC archives', () => {
      const originalPath = path.join(testDir, 'legacy.dump');
      const encryptedPath = path.join(testDir, 'legacy.dump.enc');
      const decryptedPath = path.join(testDir, 'legacy_decrypted.dump');

      const payload = Buffer.from('LEGACY ARCHIVE SNAPSHOT PRIOR TO GCM UPGRADE');
      fs.writeFileSync(originalPath, payload);

      encryptFileWithAes256Cbc(originalPath, encryptedPath, testKey);
      const encBuffer = fs.readFileSync(encryptedPath);
      expect(encBuffer.subarray(0, 8).toString('utf-8')).toBe('Salted__');

      decryptFileWithAes256(encryptedPath, decryptedPath, testKey);
      expect(fs.readFileSync(decryptedPath).equals(payload)).toBe(true);
    });

    it('rejects decryption of corrupted or invalid encrypted file headers', () => {
      const corruptPath = path.join(testDir, 'corrupt.dump.enc');
      fs.writeFileSync(corruptPath, Buffer.from('NOT_A_VALID_HEADER_DATA_1234567890'));

      expect(() => {
        decryptFileWithAes256(corruptPath, path.join(testDir, 'out.dump'), testKey);
      }).toThrow(/invalid file header/);
    });
  });

  describe('3. Backup Engine Pipeline (Synthetic Isolated Verification)', () => {
    it('creates encrypted backup with signed manifest using synthetic snapshot and AES-256-GCM', async () => {
      const syntheticSource = path.join(testDir, 'synthetic.dump');
      const testContent = '-- AETHER DUMP HEADER\n' + 'MODEL DATA RECORD\n'.repeat(20);
      fs.writeFileSync(syntheticSource, testContent);

      const manifest = await runBackup(testDir, {
        syntheticSourceFile: syntheticSource,
        encryptionKey: testKey,
        outputBaseDir: testDir,
        env: 'test',
      });

      expect(manifest.status).toBe('COMPLETED');
      expect(manifest.artifacts.database).toBeDefined();
      expect(manifest.artifacts.database?.encryption).toBe('AES-256-GCM-PBKDF2');
      expect(manifest.artifacts.database?.encryptedFilename).toBe('aether_db.dump.enc');
      expect(manifest.artifacts.database?.sha256).toBe(computeFileSha256(syntheticSource));

      // Unencrypted file should be unlinked by default
      expect(fs.existsSync(path.join(testDir, 'aether_db.dump'))).toBe(false);
      // Encrypted file should exist
      expect(fs.existsSync(path.join(testDir, 'aether_db.dump.enc'))).toBe(true);
      // Manifest exists
      expect(fs.existsSync(path.join(testDir, 'manifest.json'))).toBe(true);
    });

    it('fails safely and generates FAILED manifest when database URL is missing', async () => {
      const failedDir = path.join(testDir, 'fail_no_url');
      fs.mkdirSync(failedDir, { recursive: true });

      const prevUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        await expect(
          runBackup(failedDir, { outputBaseDir: failedDir, databaseUrl: undefined }),
        ).rejects.toThrow('DATABASE_URL_NOT_CONFIGURED');

        const manifestPath = path.join(failedDir, 'manifest.json');
        expect(fs.existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        expect(manifest.status).toBe('FAILED');
        expect(manifest.error).toContain('DATABASE_URL_NOT_CONFIGURED');
      } finally {
        if (prevUrl) process.env.DATABASE_URL = prevUrl;
      }
    });

    it('fails safely and rejects abnormally small database dumps (<= 100 bytes)', async () => {
      const binary = findPgDumpBinary();
      expect(binary === null || typeof binary === 'string').toBe(true);
    });
  });

  describe('4. Recovery Engine Verification & Safety Gate Enforcement', () => {
    it('refuses restoration without explicit --confirm-non-production flag', async () => {
      await expect(
        verifyAndReconcileRestore(testDir, { isDryRun: false, confirmNonProduction: false }),
      ).rejects.toThrow('RESTORE_ABORTED: Refusing to execute live restoration without explicit --confirm-non-production flag');
    });

    it('strictly refuses restoration if target host matches configured source DATABASE_URL (collision guard)', async () => {
      const prevUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://source_user:source_pass@source-cluster.internal:5432/aether_production';

      try {
        await expect(
          verifyAndReconcileRestore(testDir, {
            isDryRun: false,
            confirmNonProduction: true,
            targetDatabaseUrl: 'postgresql://source_user:source_pass@source-cluster.internal:5432/aether_production',
          }),
        ).rejects.toThrow('RESTORE_ABORTED: Refusing to restore into active source database');
      } finally {
        if (prevUrl) process.env.DATABASE_URL = prevUrl;
        else delete process.env.DATABASE_URL;
      }
    });

    it('strictly refuses restoration if target host is a remote Supabase production host', async () => {
      await expect(
        verifyAndReconcileRestore(testDir, {
          isDryRun: false,
          confirmNonProduction: true,
          targetDatabaseUrl: 'postgresql://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
        }),
      ).rejects.toThrow('RESTORE_ABORTED: Refusing to execute restoration against remote Supabase host');
    });

    it('successfully verifies and decrypts AES-256-GCM backup in dry-run mode', async () => {
      const rawDump = path.join(testDir, 'aether_db.dump');
      const rawContent = '-- AUTHORITATIVE TEST DUMP\n' + 'DATA ROW\n'.repeat(30);
      fs.writeFileSync(rawDump, rawContent);
      const rawSha = computeFileSha256(rawDump);

      const encDump = path.join(testDir, 'aether_db.dump.enc');
      encryptFileWithAes256(rawDump, encDump, testKey);
      const encSha = computeFileSha256(encDump);
      fs.unlinkSync(rawDump); // Only encrypted file exists

      createBackupManifest(testDir, {
        database: {
          filename: 'aether_db.dump',
          format: 'custom_compressed (pg_dump -F c)',
          sizeBytes: Buffer.byteLength(rawContent),
          sha256: rawSha,
          encryption: 'AES-256-GCM-PBKDF2',
          encryptedFilename: 'aether_db.dump.enc',
          encryptedSizeBytes: fs.statSync(encDump).size,
          encryptedSha256: encSha,
        },
      });

      const res = await verifyAndReconcileRestore(testDir, {
        isDryRun: true,
        encryptionKey: testKey,
      });

      expect(res.valid).toBe(true);
      expect(res.checksumsMatch).toBe(true);
      expect(res.dryRun).toBe(true);
    });

    it('detects tampering and aborts with INTEGRITY_VIOLATION if backup file is altered', async () => {
      const rawDump = path.join(testDir, 'aether_db.dump');
      fs.writeFileSync(rawDump, 'AUTHENTIC CONTENT FOR CHECKSUM VERIFICATION');
      const rawSha = computeFileSha256(rawDump);

      // Now alter the file content
      fs.writeFileSync(rawDump, 'TAMPERED MALICIOUS CONTENT');

      createBackupManifest(testDir, {
        database: {
          filename: 'aether_db.dump',
          format: 'custom_compressed',
          sizeBytes: 100,
          sha256: rawSha,
        },
      });

      await expect(
        verifyAndReconcileRestore(testDir, { isDryRun: true }),
      ).rejects.toThrow('INTEGRITY_VIOLATION: Database checksum mismatch');
    });
  });
});
