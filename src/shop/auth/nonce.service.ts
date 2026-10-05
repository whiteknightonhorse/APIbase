import { randomBytes } from 'node:crypto';
import { verifyMessage } from 'viem';
import { ShopAuthError } from './errors';

/** Subset of ioredis used here (also what tests mock). */
export interface NonceRedis {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
}

export type SignPurpose =
  | 'register'
  | 'accept_terms'
  | 'rotate_key'
  | 'payout_change'
  | 'reissue'
  | 'owner';

export const NONCE_TTL_S = 300;
const NONCE_PREFIX = 'shop:nonce:';
const EOA_ONLY = 'use an EOA; contract wallets in v1.1';

async function defaultRedis(): Promise<NonceRedis> {
  const { ensureRedisConnected } = await import('../../services/redis.service');
  return (await ensureRedisConnected()) as unknown as NonceRedis;
}

/** The exact text a wallet signs (spec F-1, byte-for-byte). */
export function buildSignInMessage(p: {
  address: string;
  purpose: SignPurpose;
  nonce: string;
  issuedAt: string;
}): string {
  return (
    `apibase.pro wants you to sign in with your wallet.\n` +
    `Address: ${p.address}\n` +
    `Purpose: ${p.purpose}\n` +
    `Nonce: ${p.nonce}\n` +
    `Issued At: ${p.issuedAt}`
  );
}

const MESSAGE_RE =
  /^apibase\.pro wants you to sign in with your wallet\.\nAddress: (\S+)\nPurpose: (\w+)\nNonce: ([0-9a-f]+)\nIssued At: (\S+)$/;

/** Issue a one-time nonce bound to `wallet`, TTL 300 s. Redis down -> 503. */
export async function issueNonce(wallet: string, redis?: NonceRedis): Promise<string> {
  const nonce = randomBytes(16).toString('hex');
  try {
    const r = redis ?? (await defaultRedis());
    await r.set(NONCE_PREFIX + nonce, wallet.toLowerCase(), 'EX', NONCE_TTL_S);
  } catch {
    throw new ShopAuthError(503, 'nonce store unavailable', 'retry shortly');
  }
  return nonce;
}

/**
 * Verify an EIP-191 signature over the sign-in message. The nonce in the message must exist
 * (consumed atomically with GETDEL -> single use) and be bound to `expectedAddress`; the message
 * purpose must equal `purpose`. Any failure -> 401; Redis failure -> 503.
 */
export async function verifyWalletSignature(
  args: {
    message: string;
    signature: string;
    expectedAddress: string;
    purpose: SignPurpose;
  },
  opts: { redis?: NonceRedis; now?: () => number } = {},
): Promise<void> {
  const { message, signature, expectedAddress, purpose } = args;
  const m = MESSAGE_RE.exec(message);
  if (!m) throw new ShopAuthError(401, 'malformed sign-in message');
  const [, addr, msgPurpose, nonce, issuedAt] = m;
  const expected = expectedAddress.toLowerCase();
  if (addr.toLowerCase() !== expected || msgPurpose !== purpose) {
    throw new ShopAuthError(401, 'message does not match address/purpose');
  }
  await verifyBoundNonceSignature(
    { message, signature, address: addr, nonce, issuedAt, expected },
    opts,
  );
}

/**
 * Shared tail of the verification: nonce (GETDEL, single use) bound to `expected`, freshness of
 * `issuedAt`, EIP-191 signature over `message` by `address`. Also used for the §11.2 terms
 * message, whose text differs from the sign-in template but carries the same nonce + time.
 */
export async function verifyBoundNonceSignature(
  a: {
    message: string;
    signature: string;
    address: string;
    nonce: string;
    issuedAt: string;
    expected: string;
  },
  opts: { redis?: NonceRedis; now?: () => number } = {},
): Promise<void> {
  const { message, signature, address, nonce, issuedAt, expected } = a;
  let bound: string | null;
  try {
    const r = opts.redis ?? (await defaultRedis());
    bound = await r.getdel(NONCE_PREFIX + nonce);
  } catch {
    throw new ShopAuthError(503, 'nonce store unavailable', 'retry shortly');
  }
  if (!bound || bound !== expected) throw new ShopAuthError(401, 'nonce unknown, expired or used');
  const age = ((opts.now ?? Date.now)() - Date.parse(issuedAt)) / 1000;
  if (!Number.isFinite(age) || age > NONCE_TTL_S || age < -NONCE_TTL_S) {
    throw new ShopAuthError(401, 'sign-in message expired');
  }
  let ok = false;
  try {
    ok = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    ok = false;
  }
  if (!ok) throw new ShopAuthError(401, 'invalid signature', EOA_ONLY);
}
