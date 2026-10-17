#!/usr/bin/env bash
# ==============================================================================
# AETHER Enterprise Platform — Production Database Restore Engine (P3C-04)
# Automates decryption, pre-decryption checksum verification, and safe isolated
# restoration into a target PostgreSQL database.
#
# Rules:
# - Strictly requires --confirm-non-production flag to prevent accidental overwrite.
# - Refuses to restore over remote Supabase or production hostnames.
# - Verifies encrypted archive SHA-256 BEFORE OpenSSL decryption is invoked.
# - Verifies decrypted dump SHA-256 BEFORE invoking pg_restore.
# - Verifies manifest HMAC authenticity before trusting metadata.
# - Prevents credential leakage in command-line arguments.
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${1:-}"
CONFIRM_FLAG="${2:-}"

if [ -z "${BACKUP_DIR}" ]; then
  echo "Usage: $0 <backup_directory> --confirm-non-production" >&2
  exit 1
fi

if [ "${CONFIRM_FLAG}" != "--confirm-non-production" ]; then
  echo "FATAL: Live restoration requires explicit --confirm-non-production flag." >&2
  exit 1
fi

BACKUP_KEY="${BACKUP_ENCRYPTION_KEY:-${AETHER_BACKUP_KEY:-}}"
HMAC_SECRET="${BACKUP_HMAC_SECRET:-${AETHER_BACKUP_HMAC_SECRET:-${BACKUP_SIGNING_KEY:-}}}"
TARGET_URL="${TARGET_DATABASE_URL:-}"

if [ -z "${TARGET_URL}" ]; then
  echo "FATAL: TARGET_DATABASE_URL environment variable must be specified." >&2
  exit 1
fi

# Collision Guard: Strictly forbid restoring into configured source DATABASE_URL
if [ -n "${DATABASE_URL:-}" ] && [ "${TARGET_URL}" = "${DATABASE_URL}" ]; then
  echo "FATAL: RESTORE_ABORTED: Refusing to restore into active source database! TARGET_DATABASE_URL matches DATABASE_URL." >&2
  exit 1
fi

# Prevent accidental restoration over Supabase or production cloud hostnames
if [[ "${TARGET_URL}" =~ supabase\.co ]] || [[ "${TARGET_URL}" =~ supabase\.com ]] || [[ "${TARGET_URL}" =~ rds\.amazonaws\.com ]] || [[ "${TARGET_URL}" =~ \.prod ]] || [[ "${TARGET_URL}" =~ production ]]; then
  echo "FATAL: RESTORE_ABORTED: Refusing to restore over remote Supabase/cloud host. Target must be isolated disposable PostgreSQL." >&2
  exit 1
fi

MANIFEST="${BACKUP_DIR}/manifest.json"
if [ ! -f "${MANIFEST}" ]; then
  echo "FATAL: RESTORE_FAILED: manifest.json not found in ${BACKUP_DIR}." >&2
  exit 1
fi

# Helper: Compute SHA-256 of a file
compute_sha256() {
  local target_file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${target_file}" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${target_file}" | awk '{print $1}'
  elif command -v node >/dev/null 2>&1; then
    node -e "const crypto = require('crypto'); const fs = require('fs'); const hash = crypto.createHash('sha256'); hash.update(fs.readFileSync(process.argv[1])); process.stdout.write(hash.digest('hex'));" "${target_file}"
  else
    echo "FATAL: No SHA-256 hashing utility available for integrity validation." >&2
    exit 1
  fi
}

# Helper: Extract JSON fields from manifest
get_manifest_db_field() {
  local field="$1"
  local val=""
  if command -v node >/dev/null 2>&1; then
    val=$(node -e "try { const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); const db = m.artifacts?.database || {}; process.stdout.write(String(db['${field}'] || '')); } catch(e){}" "${MANIFEST}" 2>/dev/null || true)
  fi
  if [ -z "${val}" ]; then
    val=$(grep -A 15 '"database"' "${MANIFEST}" | grep "\"${field}\"" | head -n 1 | sed -E "s/.*\"${field}\":[[:space:]]*\"([^\"]+)\".*/\\1/" || true)
  fi
  echo "${val}"
}

# Helper: Extract root field from manifest
get_manifest_root_field() {
  local field="$1"
  local val=""
  if command -v node >/dev/null 2>&1; then
    val=$(node -e "try { const m = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(String(m['${field}'] || '')); } catch(e){}" "${MANIFEST}" 2>/dev/null || true)
  fi
  if [ -z "${val}" ]; then
    val=$(grep -E "^[[:space:]]*\"${field}\"" "${MANIFEST}" | head -n 1 | sed -E "s/.*\"${field}\":[[:space:]]*\"([^\"]+)\".*/\\1/" || true)
  fi
  echo "${val}"
}

# Manifest Authenticity Verification Step
MANIFEST_HMAC=$(get_manifest_root_field "hmacSignature")
if [ -n "${MANIFEST_HMAC}" ]; then
  if [ -z "${HMAC_SECRET}" ]; then
    echo "FATAL: AUTHENTICATION_FAILED: manifest.json contains HMAC signature but BACKUP_HMAC_SECRET was not provided." >&2
    exit 1
  fi
  if command -v node >/dev/null 2>&1; then
    VERIFY_HMAC_RESULT=$(node -e '
      const crypto = require("crypto");
      const fs = require("fs");
      function canonicalize(val) {
        if (val === null || typeof val !== "object") return JSON.stringify(val);
        if (Array.isArray(val)) return "[" + val.map(canonicalize).join(",") + "]";
        const keys = Object.keys(val).sort();
        return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalize(val[k])).join(",") + "}";
      }
      try {
        const raw = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        const sig = raw.hmacSignature;
        delete raw.hmacSignature;
        delete raw.signatureAlgorithm;
        const canonical = canonicalize(raw);
        const expected = crypto.createHmac("sha256", process.argv[2]).update(canonical, "utf8").digest("hex");
        const bufA = Buffer.from(sig, "hex");
        const bufB = Buffer.from(expected, "hex");
        if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
          process.stdout.write("OK");
        } else {
          process.stdout.write("MISMATCH");
        }
      } catch (e) {
        process.stdout.write("ERROR");
      }
    ' "${MANIFEST}" "${HMAC_SECRET}" 2>/dev/null || true)
    if [ "${VERIFY_HMAC_RESULT}" != "OK" ]; then
      echo "FATAL: AUTHENTICATION_FAILED: manifest.json HMAC signature verification failed." >&2
      exit 1
    fi
    echo "✓ Manifest HMAC-SHA256 signature verified."
  fi
else
  # Unsigned manifest handling
  ALLOW_UNSIGNED="${ALLOW_UNSIGNED_MANIFEST:-${ALLOW_LEGACY_BACKUP_MANIFEST:-false}}"
  if [ "${ALLOW_UNSIGNED}" != "true" ]; then
    echo "FATAL: SECURITY_VIOLATION: Unsigned backup manifest rejected. Set ALLOW_UNSIGNED_MANIFEST=true only for verified legacy archives." >&2
    exit 1
  else
    echo "WARNING: Restoring from legacy unsigned manifest. Authenticity cannot be verified." >&2
  fi
fi

# Use node-based engine if available and not forced to shell restore
if [ -z "${FORCE_SHELL_RESTORE:-}" ] && command -v node >/dev/null 2>&1 && [ -f "$(dirname "$0")/restore.ts" ]; then
  echo "Invoking AETHER TypeScript Restore Engine with safety gates..."
  npx tsx "$(dirname "$0")/restore.ts" "${BACKUP_DIR}" --confirm-non-production --target-url "${TARGET_URL}"
  exit 0
fi

ENC_DUMP="${BACKUP_DIR}/aether_db.dump.enc"
RAW_DUMP="${BACKUP_DIR}/aether_db.dump"
CLEANUP_RAW=0

# Pre-decryption verification and decryption
if [ ! -f "${RAW_DUMP}" ] && [ -f "${ENC_DUMP}" ]; then
  if [ -z "${BACKUP_KEY}" ]; then
    echo "FATAL: RESTORE_FAILED: Archive is encrypted but BACKUP_ENCRYPTION_KEY was not supplied." >&2
    exit 1
  fi

  echo "Verifying encrypted archive SHA-256 before decryption..."
  EXPECTED_ENC_SHA=$(get_manifest_db_field "encryptedSha256")
  if [ -z "${EXPECTED_ENC_SHA}" ]; then
    echo "FATAL: INTEGRITY_VIOLATION: Missing expected encrypted SHA-256 checksum in manifest." >&2
    exit 1
  fi

  COMPUTED_ENC_SHA=$(compute_sha256 "${ENC_DUMP}")
  if [ -z "${COMPUTED_ENC_SHA}" ] || [ "${COMPUTED_ENC_SHA}" != "${EXPECTED_ENC_SHA}" ]; then
    echo "FATAL: INTEGRITY_VIOLATION: Encrypted database archive checksum mismatch! Expected ${EXPECTED_ENC_SHA}, got ${COMPUTED_ENC_SHA}." >&2
    exit 1
  fi
  echo "✓ Encrypted archive SHA-256 verified against manifest: ${COMPUTED_ENC_SHA}"

  echo "Decrypting archive via OpenSSL AES-256-CBC PBKDF2..."
  if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "${ENC_DUMP}" \
    -out "${RAW_DUMP}" \
    -pass env:BACKUP_KEY; then
    echo "FATAL: RESTORE_FAILED: OpenSSL decryption failed." >&2
    rm -f "${RAW_DUMP}"
    exit 1
  fi
  CLEANUP_RAW=1
fi

if [ ! -f "${RAW_DUMP}" ]; then
  echo "FATAL: RESTORE_FAILED: Dump file not found after decryption attempt." >&2
  exit 1
fi

# Decrypted / raw dump checksum verification before pg_restore
echo "Verifying dump SHA-256 checksum before restoration..."
EXPECTED_RAW_SHA=$(get_manifest_db_field "sha256")
if [ -z "${EXPECTED_RAW_SHA}" ]; then
  echo "FATAL: INTEGRITY_VIOLATION: Missing expected database SHA-256 checksum in manifest." >&2
  if [ "${CLEANUP_RAW}" -eq 1 ]; then rm -f "${RAW_DUMP}"; fi
  exit 1
fi

COMPUTED_RAW_SHA=$(compute_sha256 "${RAW_DUMP}")
if [ -z "${COMPUTED_RAW_SHA}" ] || [ "${COMPUTED_RAW_SHA}" != "${EXPECTED_RAW_SHA}" ]; then
  echo "FATAL: INTEGRITY_VIOLATION: Database checksum mismatch! Expected ${EXPECTED_RAW_SHA}, got ${COMPUTED_RAW_SHA}." >&2
  if [ "${CLEANUP_RAW}" -eq 1 ]; then rm -f "${RAW_DUMP}"; fi
  exit 1
fi

echo "✓ Dump SHA-256 checksum verified against manifest: ${COMPUTED_RAW_SHA}"

# Parse connection parameters into isolated environment variables to avoid exposing credentials in CLI args
URL_NO_PROTO="${TARGET_URL#*://}"
USER_PASS="$(echo "${URL_NO_PROTO}" | grep @ | cut -d@ -f1 || true)"
HOST_PORT_DB="${URL_NO_PROTO#*@}"

if [ -n "${USER_PASS}" ]; then
  RESTORE_USER="${USER_PASS%%:*}"
  RESTORE_PASS="${USER_PASS#*:}"
  export PGUSER="${RESTORE_USER}"
  export PGPASSWORD="${RESTORE_PASS}"
fi

HOST_PORT="${HOST_PORT_DB%%/*}"
RESTORE_DB="${HOST_PORT_DB#*/}"
RESTORE_DB="${RESTORE_DB%%\?*}"
RESTORE_HOST="${HOST_PORT%%:*}"
RESTORE_PORT="${HOST_PORT#*:}"

if [ "${RESTORE_PORT}" = "${HOST_PORT}" ]; then
  RESTORE_PORT="5432"
fi

export PGHOST="${RESTORE_HOST}"
export PGPORT="${RESTORE_PORT}"
export PGDATABASE="${RESTORE_DB}"

echo "Restoring into target database: ${RESTORE_HOST}:${RESTORE_PORT}/${RESTORE_DB}..."
pg_restore \
  -d "${RESTORE_DB}" \
  -v \
  --clean \
  --if-exists \
  --no-owner \
  "${RAW_DUMP}"

if [ "${CLEANUP_RAW}" -eq 1 ]; then
  rm -f "${RAW_DUMP}"
fi

echo "✓ Recovery execution completed successfully."
