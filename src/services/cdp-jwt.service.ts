import { SignJWT, importPKCS8 } from 'jose';
import { randomBytes } from 'node:crypto';
import { logger } from '../config/logger';

/**
 * CDP (Coinbase Developer Platform) Ed25519 JWT generator.
 *
 * CDP requires a short-lived JWT (120s) with `uri` field for every call.
 * Key format: base64-encoded 64-byte Ed25519 full key (32-byte seed + 32-byte public).
 * We extract the 32-byte seed, wrap as PKCS8 DER, then import via jose.
 */

type SigningKey = Awaited<ReturnType<typeof importPKCS8>>;

const CDP_HOST = 'api.cdp.coinbase.com/platform/v2/x402';

/** Ed25519 PKCS8 DER prefix (RFC 8410): SEQ(48 bytes) > INT(0) > SEQ(OID 1.3.101.112) > OCTET(32 bytes) */
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

let cachedKey: SigningKey | null = null;
let cachedSecret = '';

async function getSigningKey(keySecret: string): Promise<SigningKey> {
  if (cachedKey && cachedSecret === keySecret) return cachedKey;

  let pem: string;
  if (keySecret.startsWith('-----BEGIN')) {
    pem = keySecret;
  } else {
    // Raw base64: 64 bytes (seed + public) — extract 32-byte seed, wrap as PKCS8
    const raw = Buffer.from(keySecret, 'base64');
    const seed = raw.subarray(0, 32);
    const der = Buffer.concat([PKCS8_PREFIX, seed]);
    pem = `-----BEGIN PRIVATE KEY-----\n${der.toString('base64')}\n-----END PRIVATE KEY-----`;
  }

  cachedKey = await importPKCS8(pem, 'EdDSA');
  cachedSecret = keySecret;
  return cachedKey;
}

/**
 * Generate a CDP-compatible JWT for a specific endpoint.
 *
 * CDP REQUIRES the `uri` field: `"{METHOD} {host}{path}"`.
 * Without it, all calls return 401 Unauthorized.
 */
export async function createCdpJwt(
  keyId: string,
  keySecret: string,
  method = 'GET',
  path = '/supported',
): Promise<string> {
  const key = await getSigningKey(keySecret);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('hex');

  return new SignJWT({
    sub: keyId,
    iss: 'cdp',
    aud: ['cdp_service'],
    uri: `${method} ${CDP_HOST}${path}`,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: keyId, typ: 'JWT', nonce })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

/**
 * Build the createAuthHeaders callback for HTTPFacilitatorClient.
 *
 * Each endpoint gets its own JWT with the correct `uri` field.
 * The @x402/core SDK calls this before every verify/settle/supported request.
 */
export function buildCdpAuthHeadersFn(
  keyId: string,
  keySecret: string,
): () => Promise<Record<string, Record<string, string>>> {
  return async () => {
    try {
      const [verifyJwt, settleJwt, supportedJwt] = await Promise.all([
        createCdpJwt(keyId, keySecret, 'POST', '/verify'),
        createCdpJwt(keyId, keySecret, 'POST', '/settle'),
        createCdpJwt(keyId, keySecret, 'GET', '/supported'),
      ]);
      return {
        verify: { Authorization: `Bearer ${verifyJwt}` },
        settle: { Authorization: `Bearer ${settleJwt}` },
        supported: { Authorization: `Bearer ${supportedJwt}` },
        discovery: { Authorization: `Bearer ${supportedJwt}` },
      };
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'CDP JWT generation failed — facilitator calls will be unauthenticated',
      );
      const empty: Record<string, string> = {};
      return { verify: empty, settle: empty, supported: empty, discovery: empty };
    }
  };
}
