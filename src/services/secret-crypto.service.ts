import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Vendor-secret encryption at rest (Ф5 physical-device layer).
 *
 * We NEVER store a device vendor's password -- only the OAuth access/refresh
 * tokens issued to the END USER's own account by the vendor (Tuya, etc.),
 * per the operator's decision (cloud-to-cloud account linking, no shared
 * credentials). Those tokens are still bearer secrets, so they are encrypted
 * at rest with AES-256-GCM (authenticated encryption -- tamper detection,
 * not just confidentiality) before touching Postgres.
 *
 * Stdlib only (`node:crypto`) -- no new dependency for this.
 *
 * Key: ENCRYPTION_KEY env var, 32 raw bytes, base64 or hex encoded (64 hex
 * chars or 44 base64 chars). Hashed through SHA-256 first so any
 * high-entropy string of sufficient length works as the source key -- this
 * mirrors how API_KEY_SECRET is used elsewhere in this repo, not a new
 * pattern.
 *
 * Output format (single string, safe for a TEXT column):
 *   base64(iv[12] || authTag[16] || ciphertext)
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit GCM nonce, NIST-recommended
const TAG_BYTES = 16;

function deriveKey(secret: string): Buffer {
  // ponytail: SHA-256 stretch of an arbitrary-length secret into a 32-byte
  // key, not a KDF (PBKDF2/scrypt) -- ENCRYPTION_KEY is a generated random
  // secret (like API_KEY_SECRET), not a human password, so brute-force
  // resistance from a slow KDF buys nothing here.
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plaintext: string, keySecret: string): string {
  const key = deriveKey(keySecret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptSecret(encoded: string, keySecret: string): string {
  const key = deriveKey(keySecret);
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length < IV_BYTES + TAG_BYTES) {
    throw new Error('encryptSecret payload too short to contain iv+authTag');
  }
  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Self-check: round-trip + tamper detection. Run via
 * `tsx src/services/secret-crypto.service.ts` or from the test suite.
 */
export function demo(): void {
  const key = randomBytes(32).toString('hex');
  const secret = 'tuya-access-token-example-do-not-log-me';

  const enc = encryptSecret(secret, key);
  if (enc.includes(secret)) throw new Error('FAIL: ciphertext contains plaintext substring');

  const dec = decryptSecret(enc, key);
  if (dec !== secret) throw new Error('FAIL: round-trip mismatch');

  // Tamper with one byte -> must fail closed (GCM auth tag check), never
  // silently return corrupted plaintext.
  const raw = Buffer.from(enc, 'base64');
  raw[raw.length - 1] ^= 0xff;
  const tampered = raw.toString('base64');
  let threw = false;
  try {
    decryptSecret(tampered, key);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('FAIL: tampered ciphertext did not throw');

  // Wrong key -> must fail closed too.
  let wrongKeyThrew = false;
  try {
    decryptSecret(enc, randomBytes(32).toString('hex'));
  } catch {
    wrongKeyThrew = true;
  }
  if (!wrongKeyThrew) throw new Error('FAIL: decrypting with the wrong key did not throw');

  // eslint-disable-next-line no-console
  console.log(
    'secret-crypto.service demo: PASS (round-trip, tamper-detect, wrong-key all correct)',
  );
}

if (require.main === module) {
  demo();
}
