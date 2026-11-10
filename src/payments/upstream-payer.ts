import { existsSync, readFileSync } from 'node:fs';
import client from 'prom-client';
import { createPublicClient, getAddress, http, parseAbi } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { getRefundEnv, getUpstreamEnv } from '../config/env';
import { logger } from '../config/logger';

/**
 * T-0655 upstream payer wallet (MARKET-SIGNALS-1102 S21; key custody per REFUND-WALLET-1026
 * ruling-2). APIbase pays a provider's own 402 from a small, dedicated, operator-funded wallet:
 *   - x402 rail (Base): UPSTREAM_PAYER_KEY_BASE signs an EIP-3009 authorization (@x402/evm);
 *   - mpp rail (Tempo): UPSTREAM_PAYER_KEY_TEMPO signs the Tempo charge (mppx client).
 * Keys are generated on the server by scripts/server-wallet-init.sh, never by this code.
 * Patterns of operator-signer.ts: the key comes from the environment only, must match
 * 0x + 64 hex, is never logged, returned or serialized; only the ADDRESS is logged.
 * Startup check: the payer address must differ from the operator (gas), revenue and refund
 * wallets, and from its own entry in the server-wallet record file when that file is readable.
 */

export type PayRail = 'x402' | 'mpp';
export const PAYER_ENV_NAME: Record<
  PayRail,
  'UPSTREAM_PAYER_KEY_BASE' | 'UPSTREAM_PAYER_KEY_TEMPO'
> = {
  x402: 'UPSTREAM_PAYER_KEY_BASE',
  mpp: 'UPSTREAM_PAYER_KEY_TEMPO',
};

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export interface PayerState {
  rail: PayRail;
  state: 'ok' | 'missing' | 'mismatch';
  /** Why the state is not ok (never key material). */
  reason?: string;
  address: string | null;
}

function deriveAddress(key: unknown): string {
  if (typeof key !== 'string' || !KEY_RE.test(key)) return '';
  try {
    return privateKeyToAccount(key as `0x${string}`).address.toLowerCase();
  } catch {
    return '';
  }
}

/** Addresses the payer must never equal: operator gas wallet, revenue wallets, refund wallets. */
export function forbiddenPayerAddresses(source: NodeJS.ProcessEnv = process.env): string[] {
  const refund = getRefundEnv(source);
  const out = [
    deriveAddress(source.X402_OPERATOR_PRIVATE_KEY),
    deriveAddress(source.TEMPO_PRIVATE_KEY),
    deriveAddress(refund.REFUND_SIGNER_KEY_BASE),
    deriveAddress(refund.REFUND_SIGNER_KEY_TEMPO),
    String(source.TEMPO_WALLET_ADDRESS ?? '').toLowerCase(),
    String(source.X402_PAYMENT_ADDRESS ?? '').toLowerCase(),
  ];
  for (const e of readRecord(refund.REFUND_WALLET_RECORD)) {
    if (typeof e.name === 'string' && e.name.startsWith('REFUND_') && typeof e.address === 'string')
      out.push(e.address.toLowerCase());
  }
  return out.filter((a) => /^0x[0-9a-f]{40}$/.test(a));
}

interface RecordEntry {
  name?: unknown;
  address?: unknown;
}

function readRecord(path: string): RecordEntry[] {
  try {
    if (!existsSync(path)) return [];
    const v = JSON.parse(readFileSync(path, 'utf8') || '[]');
    return Array.isArray(v) ? (v as RecordEntry[]) : [];
  } catch {
    return [];
  }
}

const loggedStates = new Map<PayRail, string>();

/** Evaluate one rail's payer key. Pure apart from reading env and the record file. */
export function payerState(rail: PayRail, source: NodeJS.ProcessEnv = process.env): PayerState {
  const name = PAYER_ENV_NAME[rail];
  const key = getUpstreamEnv(source)[name];
  const entry = readRecord(getRefundEnv(source).REFUND_WALLET_RECORD).find((e) => e.name === name);
  const recAddr = typeof entry?.address === 'string' ? entry.address.toLowerCase() : null;
  let st: PayerState;
  if (!key) {
    st = recAddr
      ? { rail, state: 'mismatch', reason: 'key_absent_record_present', address: recAddr }
      : { rail, state: 'missing', address: null };
  } else if (!KEY_RE.test(key)) {
    st = { rail, state: 'mismatch', reason: 'key_malformed', address: recAddr };
  } else {
    const address = deriveAddress(key);
    if (!recAddr) {
      st = { rail, state: 'mismatch', reason: 'record_missing', address };
    } else if (recAddr !== address) {
      st = { rail, state: 'mismatch', reason: 'address_differs_from_record', address };
    } else if (forbiddenPayerAddresses(source).includes(address)) {
      st = {
        rail,
        state: 'mismatch',
        reason: 'address_equals_operator_revenue_or_refund',
        address,
      };
    } else {
      st = { rail, state: 'ok', address };
    }
  }
  const sig = `${st.state}:${st.reason ?? ''}:${st.address ?? ''}`;
  if (loggedStates.get(rail) !== sig) {
    loggedStates.set(rail, sig);
    const level = st.state === 'mismatch' ? 'error' : 'info';
    logger[level](
      { rail, state: st.state, reason: st.reason, payer: st.address },
      `upstream payer ${rail}: ${st.state}`,
    );
  }
  return st;
}

/** The signing account, only when the rail is ok. Never exported as a key. */
function payerAccount(rail: PayRail): PrivateKeyAccount {
  const st = payerState(rail);
  if (st.state !== 'ok') throw new Error(`upstream payer ${rail} not usable: ${st.state}`);
  const key = getUpstreamEnv()[PAYER_ENV_NAME[rail]] as `0x${string}`;
  return privateKeyToAccount(key);
}

// ---------------------------------------------------------------------------
// Metrics (bounded labels: provider = providers with an upstream_pay block; rail = 2 values)
// ---------------------------------------------------------------------------

export const upstreamPayTotal = new client.Counter({
  name: 'upstream_pay_total',
  help: 'Upstream 402 payments by provider and result (paid, free, refused_*, upstream_error, loss)',
  labelNames: ['provider', 'result'] as const,
});

export const upstreamSpendUsdTotal = new client.Counter({
  name: 'upstream_spend_usd_total',
  help: 'USD paid to upstream providers from the upstream payer wallet',
  labelNames: ['provider'] as const,
});

export const upstreamPayerBalanceUsd = new client.Gauge({
  name: 'upstream_payer_balance_usd',
  help: 'Upstream payer wallet balance (USD stablecoin), read at most once per minute',
  labelNames: ['rail'] as const,
});

// ---------------------------------------------------------------------------
// Balance (read once per minute per rail+asset)
// ---------------------------------------------------------------------------

const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const BALANCE_TTL_MS = 60_000;
const balanceCache = new Map<string, { at: number; usd: number | null }>();

function rpcFor(chainId: number, source: NodeJS.ProcessEnv): string {
  if (chainId === 8453) return source.X402_BASE_RPC_URL || 'https://mainnet.base.org';
  if (chainId === 84532) return source.X402_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
  if (chainId === 4217) return 'https://rpc.tempo.xyz';
  if (chainId === 42431) return 'https://rpc.moderato.tempo.xyz';
  throw new Error(`no RPC for chain ${chainId}`);
}

export type BalanceReader = (rail: PayRail, chainId: number, asset: string) => Promise<number>;

const chainBalance: BalanceReader = async (rail, chainId, asset) => {
  const address = payerState(rail).address;
  if (!address) throw new Error('no payer address');
  const pub = createPublicClient({
    transport: http(rpcFor(chainId, process.env), { retryCount: 1 }),
  });
  const v = await pub.readContract({
    address: getAddress(asset),
    abi: erc20,
    functionName: 'balanceOf',
    args: [getAddress(address)],
  });
  return Number(v) / 1e6;
};

let balanceReader: BalanceReader = chainBalance;

/** Test seam. */
export function setBalanceReader(r: BalanceReader | null): void {
  balanceReader = r ?? chainBalance;
  balanceCache.clear();
}

/** Cached balance in USD, or null when unreadable. */
export async function payerBalanceUsd(
  rail: PayRail,
  chainId: number,
  asset: string,
): Promise<number | null> {
  const k = `${rail}:${chainId}:${asset.toLowerCase()}`;
  const hit = balanceCache.get(k);
  if (hit && Date.now() - hit.at < BALANCE_TTL_MS) return hit.usd;
  let usd: number | null = null;
  try {
    usd = await balanceReader(rail, chainId, asset);
    upstreamPayerBalanceUsd.set({ rail }, usd);
  } catch (e) {
    logger.warn(
      { rail, err: e instanceof Error ? e.name : 'error' },
      'upstream payer balance unreadable',
    );
  }
  balanceCache.set(k, { at: Date.now(), usd });
  return usd;
}

// ---------------------------------------------------------------------------
// Daily spend cap (Redis, integer micro-USD per provider per UTC day)
// ---------------------------------------------------------------------------

export interface SpendStore {
  /** Atomically add `micro`; returns the new total, or -1 (nothing added) when it would exceed cap. */
  reserve(key: string, micro: number, capMicro: number): Promise<number>;
  get(key: string): Promise<number>;
}

const RESERVE_LUA = `
local v = redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], 172800)
if v > tonumber(ARGV[2]) then
  redis.call('DECRBY', KEYS[1], ARGV[1])
  return -1
end
return v`;

const redisSpendStore: SpendStore = {
  async reserve(key, micro, capMicro) {
    const r = (await import('../services/redis.service')).getSharedRedis();
    return Number(await r.eval(RESERVE_LUA, 1, key, String(micro), String(capMicro)));
  },
  async get(key) {
    const r = (await import('../services/redis.service')).getSharedRedis();
    return Number((await r.get(key)) ?? 0);
  },
};

let spendStore: SpendStore = redisSpendStore;

/** Test seam. */
export function setSpendStore(s: SpendStore | null): void {
  spendStore = s ?? redisSpendStore;
}

export function spendKey(provider: string, now: Date = new Date()): string {
  return `upstream:spend:${provider}:${now.toISOString().slice(0, 10)}`;
}

export function secondsToUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

function capMicro(): number {
  return Math.round(getUpstreamEnv().UPSTREAM_DAILY_CAP_USD_PER_PROVIDER * 1e6);
}

/** Reserve `micro` of today's cap. false = cap would be exceeded or the store failed (fail closed). */
export async function reserveDailySpend(provider: string, micro: number): Promise<boolean> {
  try {
    return (await spendStore.reserve(spendKey(provider), micro, capMicro())) >= 0;
  } catch (e) {
    logger.warn(
      { provider, err: e instanceof Error ? e.name : 'error' },
      'upstream spend store failed',
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pre-payment gate (called from the TOOL_STATUS pre-check: refusal = 503, nothing charged)
// ---------------------------------------------------------------------------

export interface GateInput {
  provider: string;
  rail: PayRail;
  chainId: number;
  asset: string;
  maxPriceMicro: number;
}

export interface GateRefusal {
  reason:
    | 'upstream_payer_key_missing'
    | 'upstream_payer_key_mismatch'
    | 'upstream_payer_balance_low'
    | 'upstream_payer_balance_unknown'
    | 'upstream_daily_cap_reached';
  retryAfter: number;
}

export async function upstreamGate(g: GateInput): Promise<GateRefusal | null> {
  const st = payerState(g.rail);
  if (st.state !== 'ok') {
    const reason =
      st.state === 'missing' ? 'upstream_payer_key_missing' : 'upstream_payer_key_mismatch';
    upstreamPayTotal.inc({ provider: g.provider, result: `refused_${reason.slice(9)}` });
    return { reason, retryAfter: 3600 };
  }
  const bal = await payerBalanceUsd(g.rail, g.chainId, g.asset);
  if (bal === null) return { reason: 'upstream_payer_balance_unknown', retryAfter: 60 };
  if (bal * 1e6 < 2 * g.maxPriceMicro) {
    upstreamPayTotal.inc({ provider: g.provider, result: 'refused_balance_low' });
    return { reason: 'upstream_payer_balance_low', retryAfter: 300 };
  }
  let spent = 0;
  try {
    spent = await spendStore.get(spendKey(g.provider));
  } catch {
    return { reason: 'upstream_daily_cap_reached', retryAfter: 60 };
  }
  if (spent + g.maxPriceMicro > capMicro()) {
    upstreamPayTotal.inc({ provider: g.provider, result: 'refused_daily_cap' });
    return { reason: 'upstream_daily_cap_reached', retryAfter: secondsToUtcMidnight() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Signing ports (the adapter checks the challenge BEFORE calling these)
// ---------------------------------------------------------------------------

export interface X402Accept {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface X402PaymentRequired {
  x402Version: number;
  resource?: unknown;
  accepts: X402Accept[];
}

export interface MppPolicy {
  chainId: number;
  currency: string;
  recipients: string[];
  maxAtomic: bigint;
}

export interface PayerPort {
  /** Value of the PAYMENT-SIGNATURE header for the chosen x402 requirement. */
  signX402(required: X402PaymentRequired, accepted: X402Accept): Promise<string>;
  /** Value of the Authorization header for the MPP challenge `challengeId` in `headers`. */
  signMpp(headers: Headers, challengeId: string, policy: MppPolicy): Promise<string>;
}

export const realPayerPort: PayerPort = {
  async signX402(required, accepted) {
    const account = payerAccount('x402');
    const { ExactEvmScheme } = await import('@x402/evm');
    const { encodePaymentSignatureHeader } = await import('@x402/core/http');
    const scheme = new ExactEvmScheme(account);
    const res = await scheme.createPaymentPayload(required.x402Version, accepted as never);
    return encodePaymentSignatureHeader({
      x402Version: res.x402Version,
      ...(required.resource ? { resource: required.resource as never } : {}),
      accepted: accepted as never,
      payload: res.payload,
      ...(res.extensions ? { extensions: res.extensions } : {}),
    });
  },
  async signMpp(headers, challengeId, policy) {
    const account = payerAccount('mpp');
    const { Challenge } = await import('mppx');
    const { tempo } = await import('mppx/client');
    // The root parser throws ("No Payment schemes found.") when the 402 carries no Payment
    // challenge at all; that is the same refusal as a missing id, so both end in one error that
    // does not depend on mppx's wording (T-0704 T7c). Nothing is signed in either case.
    let challenges: ReturnType<typeof Challenge.fromHeadersList>;
    try {
      challenges = Challenge.fromHeadersList(headers);
    } catch (cause) {
      throw new Error('mpp challenge vanished', { cause });
    }
    const challenge = challenges.find((c) => c.id === challengeId);
    if (!challenge) throw new Error('mpp challenge vanished');
    // mppx enforces the same policy again (chain, currency, recipients incl. splits, max amount).
    const method = tempo.charge({
      account,
      currencies: [policy.currency],
      maxAtomicAmount: policy.maxAtomic.toString(),
      expectedRecipients: policy.recipients,
      expectedChainId: policy.chainId,
      allowedChainIds: [policy.chainId],
    });
    return method.createCredential({ challenge, context: { autoSwap: false } });
  },
};
