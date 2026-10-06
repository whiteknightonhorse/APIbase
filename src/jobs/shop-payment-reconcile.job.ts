import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { getX402Config, toMicroUsdc } from '../config/x402.config';
import { finalizeConfirmed } from '../pipeline/stages/shop-settle';
import { defaultShopDeps, type ShopDeps } from '../shop/merchant-lifecycle.service';
import { releaseReservation } from '../shop/repository';
import { transition } from '../shop/order-state';

/** The on-chain reads the job needs; tests inject a fake, production uses viem. */
export interface ChainReader {
  /** USDC `authorizationState(authorizer, nonce)`: true = the authorization was used. */
  authorizationUsed(payer: string, nonce: string): Promise<boolean>;
  /** tx hash of a USDC Transfer(payer -> to, valueMicro) in the window since `sinceMs`, if any. */
  findTransfer(q: {
    payer: string;
    to: string;
    valueMicro: string;
    sinceMs: number;
  }): Promise<string | undefined>;
  /** true = mined and successful, false = missing/reverted. Throws on RPC failure. */
  receiptOk(txHash: string): Promise<boolean>;
}

const SECONDS_PER_BLOCK = 2; // Base
const BLOCK_MARGIN = 600;

export async function viemChain(): Promise<ChainReader> {
  const { createPublicClient, http, parseAbi } = await import('viem');
  const cfg = getX402Config();
  const client = createPublicClient({ transport: http(cfg.baseRpcUrl) });
  const usdc = cfg.usdcAddress as `0x${string}`;
  const abi = parseAbi([
    'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);
  return {
    authorizationUsed: async (payer, nonce) =>
      (await client.readContract({
        address: usdc,
        abi,
        functionName: 'authorizationState',
        args: [payer as `0x${string}`, nonce as `0x${string}`],
      })) as boolean,
    findTransfer: async ({ payer, to, valueMicro, sinceMs }) => {
      const latest = await client.getBlockNumber();
      const back = BigInt(
        Math.ceil((Date.now() - sinceMs) / 1000 / SECONDS_PER_BLOCK) + BLOCK_MARGIN,
      );
      const logs = await client.getLogs({
        address: usdc,
        event: abi[1],
        args: { from: payer as `0x${string}`, to: to as `0x${string}` },
        fromBlock: latest > back ? latest - back : 0n,
        toBlock: latest,
      });
      return logs.find((l) => String(l.args.value) === valueMicro)?.transactionHash;
    },
    receiptOk: async (txHash) => {
      try {
        const r = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
        return Boolean(r) && r.status === 'success';
      } catch (e) {
        if ((e as Error).name === 'TransactionReceiptNotFoundError') return false;
        throw e;
      }
    },
  };
}

interface PendingRow {
  payment_id: string;
  order_id: string;
  quote_id: string;
  merchant_id: string;
  payer: string;
  eip3009_nonce: string | null;
  pay_to: string;
  amount_usd: string;
  splits: Array<{ mode?: string; nonce?: string; fee?: number }> | null;
  created_at: Date;
  expired: boolean;
}

/**
 * §7.2 shop-payment-reconcile (worker, every 5 min). Only `shop_payments` rows that are
 * `pending`, or `failed` inside the 24 h window (never wallets): read `authorizationState` and the
 * USDC Transfer on-chain; confirmed -> PAID + delivery; still nothing once `reconcile_until` has
 * passed -> PAYMENT_FAILED for good, the quote expires and its reservation is released.
 * RPC unavailable -> the row is left untouched (warn).
 */
export async function run(opts?: { deps?: ShopDeps; chain?: ChainReader }): Promise<void> {
  const deps = opts?.deps ?? defaultShopDeps();
  const rows = await deps.db.$queryRawUnsafe<PendingRow[]>(
    `SELECT p.payment_id, p.order_id, o.quote_id, o.merchant_id, p.payer, p.eip3009_nonce, p.pay_to,
            p.amount_usd::text AS amount_usd, p.splits, p.created_at, (p.reconcile_until <= now()) AS expired
       FROM shop_payments p JOIN shop_orders o ON o.order_id = p.order_id
      WHERE p.rail = 'base' AND o.state IN ('PAYING', 'PAYMENT_FAILED')
        AND (p.chain_status = 'pending' OR (p.chain_status = 'failed' AND p.reconcile_until > now()))
      ORDER BY p.created_at
      LIMIT 200`,
  );
  if (rows.length === 0) return;
  let chain = opts?.chain;
  for (const r of rows) {
    try {
      chain ??= await viemChain();
      let tx: string | undefined;
      // T-INT-42: a fee-split payment is two authorizations in one Multicall3 call; the seller leg
      // is total - fee. Both nonces are read: one used and one not cannot happen with
      // allowFailure=false, and if seen it is a PAYMENT_MISMATCH for a human, never a PAID.
      const feeLeg = r.splits?.find((x) => x.mode === 'in_tx' && x.nonce);
      let used = r.eip3009_nonce ? await chain.authorizationUsed(r.payer, r.eip3009_nonce) : false;
      let valueMicro = toMicroUsdc(Number(r.amount_usd));
      if (feeLeg?.nonce) {
        const feeUsed = await chain.authorizationUsed(r.payer, feeLeg.nonce);
        if (used !== feeUsed) {
          await flagMismatch(deps, r);
          continue;
        }
        used = used && feeUsed;
        valueMicro = String(BigInt(valueMicro) - BigInt(toMicroUsdc(Number(feeLeg.fee ?? 0))));
      }
      if (used) {
        tx = await chain.findTransfer({
          payer: r.payer,
          to: r.pay_to,
          valueMicro,
          sinceMs: new Date(r.created_at).getTime(),
        });
      }
      if (tx) {
        await finalizeConfirmed(deps, {
          order_id: r.order_id,
          payment_id: r.payment_id,
          tx_hash: tx,
          payer: r.payer,
          request_id: 'shop-payment-reconcile',
        });
        logger.info({ job: 'shop-payment-reconcile', orderId: r.order_id }, 'payment confirmed');
      } else if (r.expired) {
        await giveUp(deps, r);
      }
    } catch (e) {
      logger.warn(
        { job: 'shop-payment-reconcile', paymentId: r.payment_id, err: (e as Error).message },
        'chain unavailable — row left untouched',
      );
    }
  }
}

async function flagMismatch(deps: ShopDeps, r: PendingRow): Promise<void> {
  await deps.db.$executeRawUnsafe(
    `INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict, category, evidence_hash)
     SELECT $1::uuid, 'merchant', 'rules', 'flag', 'payment_mismatch', $2
      WHERE NOT EXISTS (SELECT 1 FROM shop_moderation_reviews
                         WHERE category = 'payment_mismatch' AND evidence_hash = $2)`,
    r.merchant_id,
    createHash('sha256').update(r.payment_id).digest('hex'),
  );
  logger.error(
    { job: 'shop-payment-reconcile', orderId: r.order_id },
    'fee-split: exactly one of two authorizations is used on-chain — PAYMENT_MISMATCH, human only',
  );
}

async function giveUp(deps: ShopDeps, r: PendingRow): Promise<void> {
  await deps.transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE shop_payments SET chain_status = 'failed' WHERE payment_id = $1::uuid`,
      r.payment_id,
    );
    const o = await tx.$queryRawUnsafe<Array<{ state: string }>>(
      `SELECT state FROM shop_orders WHERE order_id = $1::uuid FOR UPDATE`,
      r.order_id,
    );
    if (o[0]?.state === 'PAYING') {
      await transition(tx, r.order_id, 'PAYMENT_FAILED', {
        actor: 'system',
        reason: 'reconcile_window_elapsed',
      });
    }
    await tx.$executeRawUnsafe(
      `UPDATE shop_quotes SET status = 'expired' WHERE quote_id = $1::uuid AND status = 'open'`,
      r.quote_id,
    );
    await releaseReservation(tx, { merchant_id: r.merchant_id }, r.quote_id);
  });
  logger.warn({ job: 'shop-payment-reconcile', orderId: r.order_id }, 'unconfirmed after 24h');
}

/**
 * Daily: 100 random `confirmed` payments of the last day -> receipt. Missing/reverted ->
 * shop_moderation_reviews(flag, payment_mismatch) = the PAYMENT_MISMATCH source for INT-13.
 * No automatic branch. RPC unavailable -> nothing is written for that row.
 */
export async function runDailySample(opts?: {
  deps?: ShopDeps;
  chain?: ChainReader;
}): Promise<number> {
  const deps = opts?.deps ?? defaultShopDeps();
  const rows = await deps.db.$queryRawUnsafe<Array<{ tx_hash: string; merchant_id: string }>>(
    `SELECT p.tx_hash, o.merchant_id
       FROM shop_payments p JOIN shop_orders o ON o.order_id = p.order_id
      WHERE p.chain_status = 'confirmed' AND p.tx_hash IS NOT NULL
        AND p.confirmed_at > now() - interval '1 day'
      ORDER BY random() LIMIT 100`,
  );
  if (rows.length === 0) return 0;
  let flagged = 0;
  let chain = opts?.chain;
  for (const r of rows) {
    try {
      chain ??= await viemChain();
      if (await chain.receiptOk(r.tx_hash)) continue;
      await deps.db.$executeRawUnsafe(
        `INSERT INTO shop_moderation_reviews (merchant_id, scope, layer, verdict, category, evidence_hash)
         VALUES ($1::uuid, 'merchant', 'rules', 'flag', 'payment_mismatch', $2)`,
        r.merchant_id,
        createHash('sha256').update(r.tx_hash).digest('hex'),
      );
      flagged++;
    } catch (e) {
      logger.warn(
        { job: 'shop-payment-reconcile', err: (e as Error).message },
        'daily sample: RPC unavailable — row skipped',
      );
    }
  }
  return flagged;
}
