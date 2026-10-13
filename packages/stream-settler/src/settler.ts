/**
 * APIbase stream settler (T-INT-46, UC-7 variant b). Reads the shop's settle queue from APIbase,
 * runs `settleOnChain` / `closeOnChain` (mppx) with the MERCHANT's own account, and reports each
 * transaction back. The signing key is read from the merchant's environment or file, signs locally
 * and is never sent anywhere: APIbase verifies the result on-chain.
 */
import { readFileSync } from 'node:fs';

export interface QueueItem {
  channel_id: string;
  escrow_contract: string | null;
  chain_id: number | null;
  /** micro-USD (6 decimals), as a decimal string */
  cumulative_amount: string;
  signature: string;
  action: 'settle' | 'close';
}

export interface Account {
  address: string;
}

/** The on-chain call of one queue item; the default implementation is mppx's. */
export interface ChainOps {
  run(item: QueueItem, account: Account): Promise<string>;
  /** true when the channel is already finalized on-chain (a close would only burn gas). */
  isFinalized?(item: QueueItem): Promise<boolean>;
  /** Waits for the receipt of a sent transaction. */
  waitReceipt(item: QueueItem, tx_hash: string): Promise<'success' | 'reverted' | 'timeout'>;
}

export const RECEIPT_TIMEOUT_MS = 60_000;
export const REPORT_ATTEMPTS = 6;
export const REPORT_BACKOFF_MS = 2_000;

/** A transaction that was sent but not yet reported successfully; survives between passes. */
export type PendingMap = Map<string, { tx_hash: string; action: 'settle' | 'close' }>;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface PassOptions {
  api: string;
  mk: string;
  account: Account;
  chain: ChainOps;
  fetch: Fetch;
  log: (line: string) => void;
  pending?: PendingMap;
  sleep?: (ms: number) => Promise<void>;
}

export interface PassResult {
  done: number;
  failed: number;
}

const headers = (mk: string) => ({
  authorization: `Bearer ${mk}`,
  'content-type': 'application/json',
});

/** One pass: the queue -> one on-chain transaction per item -> `POST .../settled`. */
export async function runPass(o: PassOptions): Promise<PassResult> {
  const base = o.api.replace(/\/+$/, '');
  const res = await o.fetch(`${base}/api/v1/shop/merchants/me/streams/settle-queue`, {
    headers: headers(o.mk),
  });
  if (!res.ok) throw new Error(`settle-queue answered HTTP ${res.status}`);
  const { queue } = (await res.json()) as { queue: QueueItem[] };
  const pending: PendingMap = o.pending ?? new Map();
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let done = 0;
  let failed = 0;
  for (const item of queue) {
    const id = item.channel_id;
    const tag = `${item.action} ${id}`;
    try {
      let tx_hash: string;
      const earlier = pending.get(id);
      if (earlier) {
        tx_hash = earlier.tx_hash;
        o.log(`${tag}: reporting the earlier tx ${tx_hash}`);
      } else {
        if (item.action === 'close' && o.chain.isFinalized && (await o.chain.isFinalized(item))) {
          failed++;
          o.log(
            `close ${id}: already finalized on-chain; report the original tx with POST .../settled {tx_hash}`,
          );
          continue;
        }
        tx_hash = await o.chain.run(item, o.account);
        o.log(`${tag}: tx ${tx_hash}`);
        pending.set(id, { tx_hash, action: item.action });
        const status = await o.chain.waitReceipt(item, tx_hash);
        if (status === 'reverted') {
          o.log(`${tag}: tx ${tx_hash} reverted on-chain; it is sent again next pass`);
          pending.delete(id);
          failed++;
          continue;
        }
        if (status === 'timeout') {
          o.log(
            `${tag}: receipt of ${tx_hash} not seen within 60 s; the report is retried next pass`,
          );
          failed++;
          continue;
        }
      }
      let reported = false;
      for (let k = 0; k < REPORT_ATTEMPTS; k++) {
        const r = await o.fetch(`${base}/api/v1/shop/merchants/me/streams/${id}/settled`, {
          method: 'POST',
          headers: headers(o.mk),
          body: JSON.stringify({ tx_hash }),
        });
        if (r.ok) {
          done++;
          pending.delete(id);
          reported = true;
          break;
        }
        const text = await r.text().catch(() => '');
        let parsed: { reject_reason?: unknown; error_code?: unknown } = {};
        try {
          const j: unknown = JSON.parse(text);
          if (j && typeof j === 'object') parsed = j as typeof parsed;
        } catch {
          parsed = {};
        }
        if (r.status === 503 || parsed.reject_reason === 'tx_not_found_or_unconfirmed') {
          if (k < REPORT_ATTEMPTS - 1) await sleep(REPORT_BACKOFF_MS * 2 ** k);
          continue;
        }
        pending.delete(id);
        failed++;
        reported = true;
        o.log(`${tag} failed: settled answered HTTP ${r.status}: ${text.slice(0, 300)}`);
        break;
      }
      if (!reported) {
        failed++;
        o.log(
          `${tag}: APIbase has not seen tx ${tx_hash} after ${REPORT_ATTEMPTS} attempts; retried next pass`,
        );
      }
    } catch (err) {
      failed++;
      o.log(`${tag} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { done, failed };
}

const FEE_TOKEN: Record<number, string> = {
  4217: '0x20C000000000000000000000b9537d11c60E8b50',
  42431: '0x20c0000000000000000000000000000000000000',
};

/** mppx >= 0.7 keeps the contract-backed session under `SessionLegacy`; older versions had it as `Session` (T-0393). */
async function legacySession(): Promise<{ Chain: any }> {
  const mod = (await import('mppx/tempo')) as any;
  return (mod.SessionLegacy?.Session ?? mod.Session) as { Chain: any };
}

/** The mppx implementation: `Session.Chain.settleOnChain` / `closeOnChain` with the merchant account. */
export function mppxChainOps(rpcUrl?: string, feeToken?: string): ChainOps {
  const makeClient = async (item: QueueItem) => {
    const { createClient, http } = await import('viem');
    const { tempo, tempoModerato } = await import('viem/chains');
    const chain = item.chain_id === tempoModerato.id ? tempoModerato : tempo;
    return createClient({
      chain: { ...chain, feeToken: feeToken ?? FEE_TOKEN[chain.id] } as never,
      transport: http(rpcUrl),
    });
  };
  return {
    async isFinalized(item) {
      if (!item.escrow_contract) return false;
      const Session = await legacySession();
      const oc = await Session.Chain.getOnChainChannel(
        (await makeClient(item)) as never,
        item.escrow_contract as `0x${string}`,
        item.channel_id as `0x${string}`,
      );
      return oc.finalized === true;
    },
    async waitReceipt(item, tx_hash) {
      const { waitForTransactionReceipt } = await import('viem/actions');
      try {
        const rc = await waitForTransactionReceipt((await makeClient(item)) as never, {
          hash: tx_hash as `0x${string}`,
          timeout: RECEIPT_TIMEOUT_MS,
          pollingInterval: 1_000,
        });
        return rc.status;
      } catch (err) {
        if (err instanceof Error && /Timeout/.test(err.name)) return 'timeout';
        throw err;
      }
    },
    async run(item, account) {
      const Session = await legacySession();
      const client = await makeClient(item);
      if (!item.escrow_contract) throw new Error('queue item has no escrow_contract');
      const voucher = {
        channelId: item.channel_id as `0x${string}`,
        cumulativeAmount: BigInt(item.cumulative_amount),
        signature: item.signature as `0x${string}`,
      };
      const escrow = item.escrow_contract as `0x${string}`;
      const opts = { account: account as never };
      const chainOps = Session.Chain as unknown as Record<
        'settleOnChain' | 'closeOnChain',
        (...args: unknown[]) => Promise<string>
      >;
      return item.action === 'close'
        ? chainOps.closeOnChain(client, escrow, voucher, opts)
        : chainOps.settleOnChain(client, escrow, voucher, opts);
    },
  };
}

export interface CliArgs {
  keyEnv?: string;
  keyFile?: string;
  api: string;
  mk: string;
  interval: number;
  rpc?: string;
  once: boolean;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliArgs {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mk = get('mk') ?? env.APIBASE_MERCHANT_KEY ?? '';
  if (!mk) throw new Error('--mk mk_live_… (or APIBASE_MERCHANT_KEY) is required');
  const interval = Number(get('interval') ?? '60');
  if (!Number.isFinite(interval) || interval < 5) {
    throw new Error('--interval must be at least 5 seconds');
  }
  return {
    keyEnv: get('key-env'),
    keyFile: get('key-file'),
    api: get('api') ?? 'https://apibase.pro',
    mk,
    interval,
    rpc: get('rpc'),
    once: argv.includes('--once'),
  };
}

/** The signing key from the merchant's own environment variable or file. Nothing else. */
export function loadKey(
  a: Pick<CliArgs, 'keyEnv' | 'keyFile'>,
  env: NodeJS.ProcessEnv = process.env,
  read: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): `0x${string}` {
  const raw = a.keyFile ? read(a.keyFile) : a.keyEnv ? env[a.keyEnv] : undefined;
  const key = (raw ?? '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'the settler key is missing or is not a 0x-prefixed 32-byte hex value (--key-env NAME or --key-file PATH)',
    );
  }
  return key as `0x${string}`;
}

/** A logger that cannot print a secret, whatever an error message contains. */
export function redactingLog(
  secrets: string[],
  out: (line: string) => void,
): (line: string) => void {
  return (line) => {
    let s = line;
    for (const secret of secrets) if (secret) s = s.split(secret).join('[redacted]');
    out(s);
  };
}
