import { createHash } from 'node:crypto';
import { logger } from '../config/logger';
import { CatalogError } from './catalog.errors';
import { QuoteError } from './quote.errors';
import { ShopAuthError } from './auth/errors';
import { issueKey } from './auth/merchant-key.service';
import { verifyBoundNonceSignature, type NonceRedis } from './auth/nonce.service';
import {
  currentDocs,
  merchantUnavailable,
  reasonBlocks,
  REQUIRED_DOCS,
  ShopGateError,
  termsNotAccepted,
  termsStatus,
  type LegalDoc,
} from './auth/terms.guard';
import type { ShopTx } from './db';
import {
  MerchantRegisterError,
  registerMerchant,
  type RegisterCtx,
  type RegisterInput,
} from './merchant.service';

type Redis = NonceRedis & {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};

/** Everything the tools and REST routes need; tests inject fakes, production gets Prisma. */
export interface ShopDeps {
  db: ShopTx;
  transaction<T>(fn: (tx: ShopTx) => Promise<T>): Promise<T>;
  redis?: Redis;
  now?: () => number;
  /** Fire-and-forget after a successful registration (INT-15: domain proof). */
  onRegistered?: (slug: string) => void;
}

export function defaultShopDeps(): ShopDeps {
  const prisma = async () => (await import('../services/prisma.service')).getPrisma();
  const db: ShopTx = {
    $queryRawUnsafe: async (q, ...v) => (await prisma()).$queryRawUnsafe(q, ...v),
    $executeRawUnsafe: async (q, ...v) => (await prisma()).$executeRawUnsafe(q, ...v),
  };
  return {
    db,
    transaction: async (fn) => (await prisma()).$transaction((tx) => fn(tx as unknown as ShopTx)),
    onRegistered: (slug) => {
      void import('../jobs/shop-domain-verify.job')
        .then((m) => m.verifyMerchantDomain({ db }, slug))
        .catch((err) => logger.warn({ err, slug }, 'domain verify on register failed'));
    },
  };
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** §11.2, byte for byte. Stored whole (with the signature) in shop_acceptances.message. */
export function acceptTermsMessage(
  docs: Array<Pick<LegalDoc, 'doc_id' | 'version' | 'sha256'>>,
  p: { wallet: string; nonce: string; time: string },
): string {
  const list = docs.map((d) => `${d.doc_id} v${d.version} sha256:${d.sha256}`).join('; ');
  return `I accept APIbase documents: ${list}. Wallet: ${p.wallet}. Nonce: ${p.nonce}. Time: ${p.time}`;
}

const MESSAGE_RE =
  /^I accept APIbase documents: .+\. Wallet: (\S+)\. Nonce: ([0-9a-f]+)\. Time: (\S+)$/;

export interface AcceptInput {
  wallet: string;
  doc_hashes: Array<{ doc_id: string; version: string; sha256: string }>;
  message: string;
  signature: string;
  /** Only the INT-17 form sets `checkbox+wallet_signature`. */
  method?: 'wallet_signature' | 'checkbox+wallet_signature';
}

interface MerchantRow {
  merchant_id: string;
  status: string;
  status_reason: string | null;
}

async function byWallet(db: ShopTx, wallet: string): Promise<MerchantRow | null> {
  const rows = await db.$queryRawUnsafe<MerchantRow[]>(
    `SELECT merchant_id, status, status_reason FROM shop_merchants WHERE wallet_address = $1`,
    wallet.toLowerCase(),
  );
  return rows[0] ?? null;
}

/** UC-10: verify the §11.2 acceptance, store 4 rows, activate, return the one-time key. */
export async function acceptTerms(
  d: ShopDeps,
  input: AcceptInput,
  ctx: { ip?: string; user_agent?: string } = {},
): Promise<{ status: 'active'; api_key?: string }> {
  if (!ADDR_RE.test(input.wallet ?? '')) {
    throw new MerchantRegisterError(
      422,
      'validation_failed',
      'wallet must be an EVM address',
      'fix_request',
      '/docs/integrator',
    );
  }
  const wallet = input.wallet.toLowerCase();
  const m = await byWallet(d.db, wallet);
  if (!m) throw new ShopAuthError(401, 'unknown merchant');
  if (m.status === 'deactivated' || m.status === 'suspended' || reasonBlocks(m.status_reason)) {
    throw merchantUnavailable();
  }

  const now = (d.now ?? Date.now)();
  const docs = await currentDocs(d.db, now);
  if (docs.length !== REQUIRED_DOCS.length) {
    throw new ShopAuthError(503, 'legal documents unavailable', 'retry shortly');
  }
  const offered = Array.isArray(input.doc_hashes) ? input.doc_hashes : [];
  const sameDocs =
    offered.length === docs.length &&
    docs.every((c) =>
      offered.some(
        (o) => o.doc_id === c.doc_id && o.version === c.version && o.sha256 === c.sha256,
      ),
    );
  if (!sameDocs) throw termsNotAccepted(docs);

  const parsed = MESSAGE_RE.exec(input.message ?? '');
  if (!parsed || parsed[1].toLowerCase() !== wallet) {
    throw new ShopAuthError(401, 'malformed acceptance message');
  }
  const [, , nonce, time] = parsed;
  if (input.message !== acceptTermsMessage(docs, { wallet: parsed[1], nonce, time })) {
    throw termsNotAccepted(docs);
  }

  // Replay of an acceptance that already stands: 200, no second key (nonce is spent anyway).
  const st = await termsStatus(d.db, m.merchant_id, now);
  if (m.status === 'active' && st.pending.length === 0 && st.overdue.length === 0) {
    return { status: 'active' };
  }

  await verifyBoundNonceSignature(
    {
      message: input.message,
      signature: input.signature,
      address: parsed[1],
      nonce,
      issuedAt: time,
      expected: wallet,
    },
    { redis: d.redis, now: d.now },
  );

  return d.transaction(async (tx) => {
    for (const doc of docs) {
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_acceptances
           (merchant_id, doc_id, version, sha256, method, signer, signature, message, ip_hash, user_agent)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        m.merchant_id,
        doc.doc_id,
        doc.version,
        doc.sha256,
        input.method === 'checkbox+wallet_signature'
          ? 'checkbox+wallet_signature'
          : 'wallet_signature',
        wallet,
        input.signature,
        input.message,
        ctx.ip ? sha(ctx.ip) : null,
        ctx.user_agent ?? null,
      );
    }
    const won = await tx.$queryRawUnsafe<unknown[]>(
      `UPDATE shop_merchants SET status = 'active'
        WHERE merchant_id = $1::uuid AND status = 'pending' RETURNING merchant_id`,
      m.merchant_id,
    );
    if (won.length === 0) return { status: 'active' as const };
    const api_key = await issueKey(tx, m.merchant_id, undefined, 'initial');
    logger.info({ merchant_id: m.merchant_id }, 'merchant activated');
    return { status: 'active' as const, api_key };
  });
}

/** UC-19: self-deactivation. Keys stay (orders:read/write close open orders); no new quotes. */
export async function deactivateMerchant(
  d: ShopDeps,
  merchant_id: string,
): Promise<{ status: string }> {
  return d.transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<unknown[]>(
      `UPDATE shop_merchants SET status = 'deactivated', status_reason = 'self'
        WHERE merchant_id = $1::uuid AND status IN ('pending', 'active') RETURNING merchant_id`,
      merchant_id,
    );
    if (rows.length > 0) {
      await tx.$executeRawUnsafe(
        `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
        'shop.merchant.deactivated',
        JSON.stringify({ merchant_id, reason: 'self' }),
      );
    }
    const cur = await tx.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT status FROM shop_merchants WHERE merchant_id = $1::uuid`,
      merchant_id,
    );
    return { status: cur[0]?.status ?? 'deactivated' };
  });
}

export async function registerWithDocs(
  d: ShopDeps,
  input: RegisterInput,
  ctx: Partial<RegisterCtx> = {},
) {
  const r = await registerMerchant(input, { ...ctx, db: d.db, redis: d.redis, now: d.now });
  d.onRegistered?.(input.slug);
  const docs = await currentDocs(d.db, (d.now ?? Date.now)());
  return {
    merchant_id: r.merchant_id,
    slug: input.slug,
    status: 'pending' as const,
    docs_to_accept: docs.map(({ doc_id, version, sha256, url }) => ({
      doc_id,
      version,
      sha256,
      url,
    })),
  };
}

export interface ApiErr {
  status: number;
  body: Record<string, unknown>;
}

/** One error mapping for MCP (isError) and REST: same codes, same shape (§6.4, F-15). */
export function toApiError(err: unknown, request_id?: string): ApiErr {
  const base = (status: number, code: string, message: string, extra: object = {}): ApiErr => ({
    status,
    body: {
      error: code,
      error_code: code,
      message,
      ...(request_id ? { request_id } : {}),
      ...extra,
    },
  });
  if (err instanceof MerchantRegisterError) {
    return base(err.status, err.error_code, err.message, {
      suggested_action: err.suggested_action,
      documentation_url: err.documentation_url,
      ...(err.alternatives ? { alternatives: err.alternatives } : {}),
      ...(err.retry_after ? { retry_after: err.retry_after } : {}),
    });
  }
  if (err instanceof ShopGateError) {
    return base(err.status, err.error_code, err.message, {
      suggested_action: err.suggested_action,
      documentation_url: err.documentation_url,
      ...err.extra,
    });
  }
  if (err instanceof CatalogError) {
    return base(err.status, err.error_code, err.message, {
      suggested_action: err.suggested_action,
      ...err.extra,
    });
  }
  if (err instanceof QuoteError) {
    return base(err.status, err.error_code, err.message, {
      suggested_action: err.suggested_action,
      ...err.extra,
    });
  }
  if (err instanceof ShopAuthError) {
    const code =
      err.status === 401
        ? 'unauthorized'
        : err.status === 403
          ? 'forbidden'
          : err.status === 429
            ? 'rate_limited'
            : err.status === 503
              ? 'service_unavailable'
              : 'conflict';
    return base(err.status, code, err.message, {
      suggested_action:
        err.suggested_action ?? (err.status === 401 ? 'fix_request' : 'retry_after_delay'),
      documentation_url: '/docs/integrator#registration--terms',
    });
  }
  logger.error({ err }, 'shop merchant call failed');
  return base(500, 'internal_error', 'internal error', { suggested_action: 'contact_support' });
}
