/**
 * APIbase merchant renewer (T-INT-49, UC-9 on Tempo). Reads the renew queue of your shop from
 * APIbase, and for each due subscription period sends the payment with YOUR access key, from the
 * payer's account (`Account.fromSecp256k1(key, {access: payer})` + TIP-20 `transferWithMemo`):
 * one transfer of `amount - fee` to your payout wallet and, when the platform fee is on, one of
 * `fee` to the fee wallet. Then it reports the transaction hashes. The key is generated here
 * (`init`), stays on this machine, and is never sent anywhere: APIbase learns only its address
 * and verifies every renewal on-chain.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export interface QueueItem {
  subscription_id: string;
  period_no: number;
  payer: string;
  /** micro-USDC (6 decimals), the whole period price, as a decimal string */
  amount: string;
  /** bytes32 memo, sha256(subscription_id:period_no) */
  memo: string;
  recipient: string;
  token: string;
  /** fee legs: `amount - sum(splits)` goes to `recipient` */
  splits?: Array<{ wallet: string; amount: string }>;
}

/** One TIP-20 `transferWithMemo` sent with the access key from the payer's account. */
export interface Transfer {
  payer: string;
  token: string;
  to: string;
  amount: bigint;
  memo: string;
}

/** The on-chain call; the default implementation is viem/tempo's. */
export interface ChainOps {
  send(t: Transfer, key: `0x${string}`): Promise<string>;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface PassOptions {
  api: string;
  mk: string;
  key: `0x${string}`;
  chain: ChainOps;
  fetch: Fetch;
  log: (line: string) => void;
}

export interface PassResult {
  done: number;
  failed: number;
}

const headers = (mk: string) => ({
  authorization: `Bearer ${mk}`,
  'content-type': 'application/json',
});

/** The transfers of one queue item: the merchant leg first, then the fee leg(s). */
export function legsOf(item: QueueItem): Array<{ to: string; amount: bigint }> {
  const total = BigInt(item.amount);
  const fees = (item.splits ?? []).map((s) => ({ to: s.wallet, amount: BigInt(s.amount) }));
  const fee = fees.reduce((a, f) => a + f.amount, 0n);
  if (fee >= total) throw new Error('queue item: the fee is not smaller than the amount');
  return [{ to: item.recipient, amount: total - fee }, ...fees.filter((f) => f.amount > 0n)];
}

/** One pass: the queue -> the transfers by your key -> `POST .../renewed {period_no, tx_hashes}`. */
export async function runPass(o: PassOptions): Promise<PassResult> {
  const base = o.api.replace(/\/+$/, '');
  const res = await o.fetch(`${base}/api/v1/shop/merchants/me/subscriptions/renew-queue`, {
    headers: headers(o.mk),
  });
  if (!res.ok) throw new Error(`renew-queue answered HTTP ${res.status}`);
  const { queue } = (await res.json()) as { queue: QueueItem[] };
  let done = 0;
  let failed = 0;
  for (const item of queue) {
    const label = `${item.subscription_id} period ${item.period_no}`;
    try {
      const tx_hashes: string[] = [];
      for (const leg of legsOf(item)) {
        tx_hashes.push(
          await o.chain.send(
            {
              payer: item.payer,
              token: item.token,
              to: leg.to,
              amount: leg.amount,
              memo: item.memo,
            },
            o.key,
          ),
        );
      }
      o.log(`${label}: sent ${tx_hashes.join(', ')}`);
      const r = await o.fetch(
        `${base}/api/v1/shop/merchants/me/subscriptions/${item.subscription_id}/renewed`,
        {
          method: 'POST',
          headers: headers(o.mk),
          body: JSON.stringify({ period_no: item.period_no, tx_hashes }),
        },
      );
      if (!r.ok) throw new Error(`renewed answered HTTP ${r.status}`);
      done++;
    } catch (err) {
      failed++;
      o.log(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { done, failed };
}

/**
 * The viem/tempo implementation. The spending account is the PAYER's, signed by the access key
 * the payer authorized (`access`); the gas is paid by your key address (`feePayer`), so fund that
 * address with the fee token.
 */
export function viemChainOps(rpcUrl?: string): ChainOps {
  return {
    async send(t, key) {
      const { Account, Actions } = await import('viem/tempo');
      const { createClient, http } = await import('viem');
      const { tempo } = await import('viem/chains');
      const account = Account.fromSecp256k1(key, { access: t.payer as `0x${string}` });
      const sponsor = Account.fromSecp256k1(key);
      const client = createClient({
        account,
        chain: tempo as never,
        transport: http(rpcUrl),
      });
      const r = await Actions.token.transferSync(
        client as never,
        {
          token: t.token as `0x${string}`,
          to: t.to as `0x${string}`,
          amount: t.amount,
          memo: t.memo as `0x${string}`,
          feePayer: sponsor,
        } as never,
      );
      return r.receipt.transactionHash;
    },
  };
}

export interface CliArgs {
  command: 'init' | 'run';
  keyEnv?: string;
  keyFile?: string;
  api: string;
  mk: string;
  interval: number;
  rpc?: string;
  once: boolean;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliArgs {
  const command = argv[0];
  if (command !== 'init' && command !== 'run') {
    throw new Error('usage: apibase-merchant-renewer init|run [options]');
  }
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mk = get('mk') ?? env.APIBASE_MERCHANT_KEY ?? '';
  if (command === 'run' && !mk) {
    throw new Error('--mk mk_live_… (or APIBASE_MERCHANT_KEY) is required');
  }
  const interval = Number(get('interval') ?? '60');
  if (!Number.isFinite(interval) || interval < 5) {
    throw new Error('--interval must be at least 5 seconds');
  }
  return {
    command,
    keyEnv: get('key-env'),
    keyFile: get('key-file'),
    api: get('api') ?? 'https://apibase.pro',
    mk,
    interval,
    rpc: get('rpc'),
    once: argv.includes('--once'),
  };
}

/** The access key from the merchant's own environment variable or file. Nothing else. */
export function loadKey(
  a: Pick<CliArgs, 'keyEnv' | 'keyFile'>,
  env: NodeJS.ProcessEnv = process.env,
  read: (p: string) => string = (p) => readFileSync(p, 'utf8'),
): `0x${string}` {
  const raw = a.keyFile ? read(a.keyFile) : a.keyEnv ? env[a.keyEnv] : undefined;
  const key = (raw ?? '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'the renewer key is missing or is not a 0x-prefixed 32-byte hex value (--key-env NAME or --key-file PATH)',
    );
  }
  return key as `0x${string}`;
}

/**
 * `init`: generate a fresh key LOCALLY, write it to a file (mode 0600, never overwritten) and
 * return only its address. The key is not printed and is never sent to APIbase.
 */
export function initKey(
  file: string,
  generate: () => { key: `0x${string}`; address: string },
  write: (path: string, data: string, opts: { mode: number; flag: string }) => void = writeFileSync,
): { address: string; file: string } {
  const { key, address } = generate();
  write(file, `${key}\n`, { mode: 0o600, flag: 'wx' });
  return { address, file };
}

/** A logger that cannot print the key or the merchant API key, whatever an error message contains. */
export function redactingLog(
  hidden: string[],
  out: (line: string) => void,
): (line: string) => void {
  return (line) => {
    let s = line;
    for (const h of hidden) if (h) s = s.split(h).join('[redacted]');
    out(s);
  };
}
