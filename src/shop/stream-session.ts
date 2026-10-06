import { getMppConfig } from '../config/mpp.config';
import { logger } from '../config/logger';
import type { StreamTerms } from './catalog.service';

/**
 * UC-7 / F-9: the MPP `tempo.session` method of ONE merchant's stream (§5.2 `shop_stream_sessions`).
 *
 * The channel's on-chain payee is `recipient`, and only the payee can `settle`/`close` it (escrow
 * ABI errors NotPayee/NotPayer). So a channel is only ever opened to the merchant's own
 * `payout_wallet_tempo`, and an APIbase-held key may settle it only when that key IS the merchant's
 * wallet (the pilot: our own demo shop). Anything else would make APIbase a custodian: refused.
 */

export const STREAM_LRU_MAX = 1000;
/** Redis key prefix of the channel store, apart from the charge replay store (T-0257). */
export const STREAM_STORE_PREFIX = 'stream:';
export const STREAM_DECIMALS = 6;
const MICRO = 10n ** BigInt(STREAM_DECIMALS);

export type StreamErrorCode =
  | 'stream_unavailable'
  | 'stream_settler_misconfigured'
  | 'deposit_below_minimum'
  | 'not_found'
  | 'bad_request'
  | 'mpp_unavailable'
  | 'unknown_channel'
  | 'channel_closed';

/** HTTP-shaped refusal of the stream route. */
export class StreamError extends Error {
  constructor(
    readonly status: number,
    readonly code: StreamErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'StreamError';
  }
}

export interface StreamMerchant {
  merchant_id: string;
  slug: string;
  payout_wallet_tempo: string;
  stream_settler: string | null;
}

/** `"0.0001"` -> 100n (micro-USD). Decimal strings only, at most six fractional digits. */
export function toMicro(usd: string | number): bigint {
  const s = String(usd).trim();
  const m = /^(\d{1,13})(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) throw new Error(`not a USD amount with at most 6 digits: ${s}`);
  return BigInt(m[1]) * MICRO + BigInt((m[2] ?? '').padEnd(STREAM_DECIMALS, '0'));
}

/** 600n -> "0.0006" (trailing zeros trimmed, at least one integer digit). */
export function fromMicro(micro: bigint): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const whole = abs / MICRO;
  const frac = (abs % MICRO).toString().padStart(STREAM_DECIMALS, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** What the session handler returns for a stream URL. */
export interface StreamMethod {
  /** `Mppx.create({ methods: [tempo.session(...)] })`: `mppx.session({ amount })(request)`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mppx: any;
  /** The signing account: it settles and closes channels (payee = recipient = this address). */
  account: { address: string };
  recipient: string;
  /** mppx `ChannelStore` over the `stream:` Redis store (same instance the session method uses). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channels: any;
  chainId: number;
  rpcUrl: string;
}

const lru = new Map<string, StreamMethod>();
export const streamMethodCacheSize = () => lru.size;
export const clearStreamMethodCache = () => lru.clear();

/**
 * The account allowed to settle this merchant's channels, or a refusal. `apibase_pilot` needs
 * `INTEGRATOR_STREAM_PILOT_TEMPO_KEY` AND that key's address to equal the merchant's payout wallet
 * (otherwise 500: a challenge would be signed by a key that cannot settle what it sells, or worse,
 * would pay a wallet APIbase does not own).
 */
export async function resolveStreamAccount(
  merchant: StreamMerchant,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ address: string }> {
  if (merchant.stream_settler !== 'apibase_pilot') {
    // null: streaming not enabled for the merchant; 'merchant': settled with the merchant's own key (INT-46)
    throw new StreamError(409, 'stream_unavailable', 'streaming is not available for this shop');
  }
  const key = env.INTEGRATOR_STREAM_PILOT_TEMPO_KEY;
  if (!key) {
    throw new StreamError(409, 'stream_unavailable', 'streaming is not available for this shop');
  }
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount(key as `0x${string}`);
  if (account.address.toLowerCase() !== merchant.payout_wallet_tempo.toLowerCase()) {
    logger.error(
      { merchant_id: merchant.merchant_id, slug: merchant.slug },
      'stream: the pilot settler key does not control the merchant payout wallet — refusing to sell streams',
    );
    throw new StreamError(
      500,
      'stream_settler_misconfigured',
      'the stream settler is misconfigured for this shop',
    );
  }
  return account;
}

/** Store backend over the shared Redis with the `stream:` prefix (CAS update from T-0268). */
async function streamStore() {
  const { Store } = await import('mppx/server');
  const { getSharedRedis } = await import('../services/redis.service');
  const { atomicRedisAdapter } = await import('../services/mppx-redis-store');
  const base = atomicRedisAdapter(getSharedRedis());
  const p = STREAM_STORE_PREFIX;
  const store = Store.redis({
    get: (k: string) => base.get(p + k),
    set: (k: string, v: string) => base.set(p + k, v),
    del: (k: string) => base.del(p + k),
    update: (k: string, fn: (current: string | null) => unknown) => base.update(p + k, fn as never),
  });
  if (typeof (store as { update?: unknown }).update !== 'function') {
    throw new Error('mppx stream store has no atomic update — refusing to sell streams');
  }
  return store;
}

/**
 * Per-merchant (and per-terms) session method, cached in an LRU of 1 000 like the storefronts.
 * Throws StreamError 409 `stream_unavailable` / 500 `stream_settler_misconfigured` BEFORE any
 * challenge can be built.
 */
export async function getStreamMethod(
  merchant: StreamMerchant,
  terms: Pick<StreamTerms, 'rate_per_s_usd' | 'min_deposit_usd'>,
): Promise<StreamMethod> {
  const cfg = getMppConfig();
  if (!cfg.enabled) throw new StreamError(503, 'mpp_unavailable', 'MPP is not enabled');
  const account = await resolveStreamAccount(merchant);
  const recipient = merchant.payout_wallet_tempo;
  // Defence in depth: the payee of the channel is the merchant payout wallet and nothing else.
  if (account.address.toLowerCase() !== recipient.toLowerCase()) {
    throw new StreamError(500, 'stream_settler_misconfigured', 'stream payee mismatch');
  }
  const key = [
    merchant.merchant_id,
    recipient.toLowerCase(),
    terms.rate_per_s_usd,
    terms.min_deposit_usd,
    cfg.chainId,
  ].join('|');
  const hit = lru.get(key);
  if (hit) {
    lru.delete(key);
    lru.set(key, hit);
    return hit;
  }

  const { Mppx, tempo } = await import('mppx/server');
  const { Session } = await import('mppx/tempo');
  const store = await streamStore();
  const method = tempo.session({
    account: account as never,
    recipient: recipient as `0x${string}`,
    currency: cfg.usdcAddress as `0x${string}`,
    suggestedDeposit: fromMicro(
      toMicro(terms.min_deposit_usd) > MICRO ? toMicro(terms.min_deposit_usd) : MICRO,
    ),
    unitType: 'second',
    amount: terms.rate_per_s_usd,
    store,
    testnet: cfg.testnet,
    waitForConfirmation: true,
  } as never);
  const mppx = Mppx.create({ methods: [method], secretKey: cfg.secretKey, realm: cfg.realm });
  const built: StreamMethod = {
    mppx,
    account,
    recipient,
    channels: Session.ChannelStore.fromStore(store as never),
    chainId: cfg.chainId,
    rpcUrl: cfg.rpcUrl,
  };
  lru.set(key, built);
  while (lru.size > STREAM_LRU_MAX) lru.delete(lru.keys().next().value as string);
  return built;
}

/** Characters of content released per second of stream. */
export const CONTENT_CHARS_PER_S = 16;

/** The slice of `payload` that seconds `[fromS, toS)` of the stream unlock (empty past the end). */
export function contentPortion(payload: string, fromS: number, toS: number): string {
  return payload.slice(fromS * CONTENT_CHARS_PER_S, toS * CONTENT_CHARS_PER_S);
}
