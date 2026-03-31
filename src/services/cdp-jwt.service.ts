import { SignJWT, importPKCS8 } from 'jose';
import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger';

/**
 * CDP (Coinbase Developer Platform) Ed25519 JWT generator.
 *
 * CDP requires a short-lived JWT (120s) for every verify/settle/supported call.
 * The private key is parsed once and cached; JWTs are generated per-call.
 */

type SigningKey = Awaited<ReturnType<typeof importPKCS8>>;

let cachedKey: SigningKey | null = null;
let cachedKeyPem: string = '';

async function getSigningKey(pem: string): Promise<SigningKey> {
  if (cachedKey && cachedKeyPem === pem) return cachedKey;
  cachedKey = await importPKCS8(pem, 'EdDSA');
  cachedKeyPem = pem;
  return cachedKey;
}

/**
 * Generate a CDP-compatible JWT token.
 * Header: { alg: 'EdDSA', kid: keyId, typ: 'JWT', nonce: UUID }
 * Payload: { sub: keyId, iss: 'cdp', aud: ['cdp_service'], exp: now+120 }
 */
export async function createCdpJwt(keyId: string, keySecret: string): Promise<string> {
  const key = await getSigningKey(keySecret);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ sub: keyId, iss: 'cdp', aud: ['cdp_service'] })
    .setProtectedHeader({ alg: 'EdDSA', kid: keyId, typ: 'JWT', nonce: randomUUID() })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

/**
 * Build the createAuthHeaders callback for HTTPFacilitatorClient.
 *
 * Returns a function that generates fresh JWT auth headers for each facilitator call.
 * Shape: { verify: { Authorization: ... }, settle: { ... }, supported: { ... } }
 */
export function buildCdpAuthHeadersFn(
  keyId: string,
  keySecret: string,
): () => Promise<Record<string, Record<string, string>>> {
  return async () => {
    try {
      const token = await createCdpJwt(keyId, keySecret);
      const auth = { Authorization: `Bearer ${token}` };
      return { verify: auth, settle: auth, supported: auth, discovery: auth };
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'CDP JWT generation failed — facilitator calls will be unauthenticated',
      );
      return { verify: {}, settle: {}, supported: {}, discovery: {} };
    }
  };
}
