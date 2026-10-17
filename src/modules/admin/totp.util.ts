import crypto from 'crypto';

/**
 * Decode a Base32 encoded string into a Buffer.
 * Supports standard RFC 4648 Base32 alphabet.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[\s=-]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Verify a 6-digit TOTP code against a secret key using standard HMAC-SHA1 RFC 6238.
 * Allows a configurable time drift window (default +/- 1 step of 30 seconds).
 */
export function verifyTotpToken(secret: string, token: string, window: number = 1): boolean {
  if (!secret || !token) return false;
  const normalizedToken = token.trim();
  if (normalizedToken.length !== 6 || !/^\d{6}$/.test(normalizedToken)) {
    return false;
  }

  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    key = Buffer.from(secret, 'utf-8');
  }

  const epoch = Math.floor(Date.now() / 1000);
  const timeStep = 30;
  const currentCounter = Math.floor(epoch / timeStep);

  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i;
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const generatedCode = (binary % 1000000).toString().padStart(6, '0');
    if (crypto.timingSafeEqual(Buffer.from(generatedCode), Buffer.from(normalizedToken))) {
      return true;
    }
  }

  return false;
}
