import { randomUUID } from 'node:crypto';
import { getX402Config, toMicroUsdc } from '../config/x402.config';
import { checkBan } from '../services/moderation-ban.service';
import { currentPayout } from './auth/identity.service';
import { assertTermsAccepted } from './auth/terms.guard';
import { cents, TEST_SKU } from './catalog.service';
import type { ShopTx } from './db';
import type { ShopDeps } from './merchant-lifecycle.service';
import { createQuotedOrder, transition } from './order-state';
import { QuoteError } from './quote.errors';
import { baseRailDisabled } from './fee-invoice.service';
import { cancelPaidOrder } from './order-lifecycle.service';
import { isPayer } from './order-payment.service';
import { releaseReservation, reserveSlot, reserveStock, takenSlots } from './repository';
import type { SubscriptionTerms } from './catalog.service';
import {
  RENEWAL_WINDOW_H,
  type SubscriptionBinding,
  type SubscriptionPlan,
} from './subscription-core';

export const QUOTE_RATE_PER_MIN = 30;
export const QUOTE_RATE_PER_HOUR = 300;
export const MAX_QUOTE_ITEMS = 50;
const NEW_MERCHANT_DAYS = 30;
const NEW_MERCHANT_ORDERS = 10;
const DEFAULT_TTL_S = 900;
const MIN_TTL_S = 300;
const MAX_TTL_S = 3600;
const DEFAULT_MAX_ORDER_USD = 10000;
const DEFAULT_NEW_CAP_USD = 200;
const DEFAULT_HUMAN_CONFIRM_USD = 100;
const DOCS = '/docs/integrator#quotes';

/** Platform switches (§7.1/§7.3), read per call so a flip needs no restart. */
export function integratorConfig(env: NodeJS.ProcessEnv = process.env) {
  const num = (v: string | undefined, d: number) =>
    v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
  return {
    fee_enabled: env.INTEGRATOR_FEE_ENABLED === 'true',
    fee_bps: num(env.INTEGRATOR_FEE_BPS, 150),
    fee_min_usd: num(env.INTEGRATOR_FEE_MIN_USD, 0.05),
    min_order_usd: num(env.INTEGRATOR_MIN_ORDER_USD, 1),
    test_sku_daily_cap: num(env.INTEGRATOR_TEST_SKU_DAILY_CAP, 3),
    base_orders_enabled: env.INTEGRATOR_BASE_ORDERS_ENABLED === 'true',
    mpp_enabled: env.MPP_ENABLED === 'true',
    gas_estimate_usd: num(env.X402_GAS_ESTIMATE_USD, 0.003),
    public_url: (env.PUBLIC_BASE_URL || 'https://apibase.pro').replace(/\/+$/, ''),
  };
}

/**
 * §7.1: `max(total x BPS / 10000, FEE_MIN)`, rounded UP to the cent; 0 when the fee is
 * switched off or for the test SKU. Integer cents throughout (89.00 -> 133.5 -> 134 -> 1.34).
 */
export function computeFeeCents(
  totalCents: number,
  is_test: boolean,
  cfg = integratorConfig(),
): number {
  if (!cfg.fee_enabled || is_test) return 0;
  const pct = Math.ceil((totalCents * cfg.fee_bps) / 10000 - 1e-9);
  return Math.max(pct, Math.ceil(cfg.fee_min_usd * 100 - 1e-9));
}

export interface Buyer {
  /** `agent:<id>` | `wallet:<sha256>` | `ip:<addr>` -- the key of limits, ban counter and idempotency. */
  identity: string;
}

export interface QuoteItemInput {
  sku: string;
  variant?: string;
  qty: number;
}

export interface QuoteInput {
  items: QuoteItemInput[];
  shipping_option?: string;
  delivery_slot?: string;
  buyer_ref?: string;
  /** T-INT-41 (UC-9): period 1 of the item's subscription; one item, quantity 1. */
  subscribe?: boolean;
}

interface MerchantRow {
  merchant_id: string;
  slug: string;
  status: string;
  status_reason: string | null;
  created_at: Date;
  limits: Record<string, unknown> | null;
  reputation: Record<string, unknown> | null;
  payout_wallet_base: string;
  payout_wallet_tempo: string;
  payout_pending: { rail: 'base' | 'tempo'; wallet: string; effective_at: string } | null;
  encryption_key?: Record<string, unknown> | null;
}

interface ProductRow {
  product_id: string;
  sku: string;
  title: string;
  price_usd: string;
  is_test: boolean;
  available: number | null;
  reserved: number;
  fulfillment_mode: string;
  requires_pii: string[];
  category: string | null;
  shipping_options: Array<{ id: string; label: string; price_usd: string | number }>;
  delivery_slots: Array<{ id: string; label: string; starts_at?: string }>;
  subscription: SubscriptionTerms | null;
}

interface VariantRow {
  variant_id: string;
  product_id: string;
  sku: string;
  title: string;
  price_usd: string | null;
  available: number | null;
  reserved: number;
}

export interface QuoteLine {
  sku: string;
  variant?: string;
  title: string;
  qty: number;
  unit_price_usd: number;
  line_total_usd: number;
}

export interface QuoteResponse {
  quote_id: string;
  order_id: string;
  items: QuoteLine[];
  total_usd: number;
  /** T-INT-22: physical quotes only; already part of total_usd. */
  shipping_usd?: number;
  shipping_option?: string;
  delivery_slot?: string;
  fee_disclosed: false;
  expires_at: string;
  requires_pii: string[];
  requires_human_confirmation: boolean;
  /** T-INT-21: present when requires_pii is non-empty; encrypt each kind to it (AAD = quote_id). */
  merchant_encryption_key?: Record<string, unknown> | null;
  pay: {
    x402?: {
      payTo: string;
      amount: string;
      network: string;
      asset: string;
      extra: { quote_id: string; subscription?: { id: string; period_no: number } };
    };
    mpp?: { url: string };
  };
  terms_update_pending?: { docs: unknown[] };
  /** T-INT-41: the quote is a subscription period (period 1 with `subscribe: true`, or a renewal). */
  subscription_terms?: SubscriptionTermsView;
}

export interface SubscriptionTermsView {
  period: { unit: 'day' | 'week' | 'month'; count: number };
  amount: number;
  max_periods: number | null;
  renewal_window_h: number;
  cancel_anytime: true;
}

/** A renewal asked for by the subscription service: the period it pays, on the plan it was bought on. */
export interface RenewalOpts {
  subscription_id: string;
  period_no: number;
  plan: SubscriptionPlan;
}

const now = (d: ShopDeps) => (d.now ?? Date.now)();
const usd = (c: number) => c / 100;
const money = (c: number) => (c / 100).toFixed(2);

const merchantCols = `merchant_id, slug, status, status_reason, created_at, limits, reputation,
  payout_wallet_base, payout_wallet_tempo, payout_pending, encryption_key`;

async function loadMerchant(db: ShopTx, merchant_id: string): Promise<MerchantRow> {
  const rows = await db.$queryRawUnsafe<MerchantRow[]>(
    `SELECT ${merchantCols} FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  if (!rows[0]) throw new QuoteError(404, 'not_found', 'merchant not found', 'use_different_tool');
  return rows[0];
}

/** Slug -> merchant_id for the REST/MCP entry points; unknown slug is 404. */
export async function merchantIdBySlug(db: ShopTx, slug: unknown): Promise<string> {
  if (typeof slug !== 'string' || !/^[a-z0-9-]{3,40}$/.test(slug)) {
    throw new QuoteError(404, 'not_found', 'merchant not found', 'use_different_tool', {
      documentation_url: DOCS,
    });
  }
  const rows = await db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
    `SELECT merchant_id FROM shop_merchants WHERE slug = $1`,
    slug,
  );
  if (!rows[0]) {
    throw new QuoteError(404, 'not_found', 'merchant not found', 'use_different_tool', {
      documentation_url: DOCS,
    });
  }
  return rows[0].merchant_id;
}

/** §7.3 test SKU: orders of this merchant that were PAID (or went further) in the last 24 h. */
export async function countPaidTestOrders24h(
  db: ShopTx,
  merchant_id: string,
  at: number = Date.now(),
): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT count(*) AS c
       FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
      WHERE o.merchant_id = $1::uuid AND q.is_test
        AND o.state NOT IN ('QUOTED', 'EXPIRED', 'CANCELLED', 'PAYING', 'PAYMENT_FAILED')
        AND COALESCE(o.settled_at, o.created_at) > $2::timestamptz - interval '24 hours'`,
    merchant_id,
    new Date(at).toISOString(),
  );
  return Number(rows[0]?.c ?? 0);
}

type RateRedis = NonNullable<ShopDeps['redis']>;

/** §8.4: 30 quotes/min and 300/hour per buyer identity. Fail-open if Redis is down. */
async function takeQuoteToken(d: ShopDeps, identity: string): Promise<void> {
  let redis: RateRedis | undefined = d.redis;
  try {
    if (!redis) {
      const { ensureRedisConnected } = await import('../services/redis.service');
      redis = (await ensureRedisConnected()) as unknown as RateRedis;
    }
    const t = now(d);
    for (const [label, ms, limit] of [
      ['m', 60_000, QUOTE_RATE_PER_MIN],
      ['h', 3_600_000, QUOTE_RATE_PER_HOUR],
    ] as const) {
      const key = `shop:quote-rl:${label}:${identity}:${Math.floor(t / ms)}`;
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, Math.ceil(ms / 1000) + 5);
      if (n > limit) {
        throw new QuoteError(
          429,
          'rate_limited',
          `quote limit reached (${QUOTE_RATE_PER_MIN}/min, ${QUOTE_RATE_PER_HOUR}/hour)`,
          'retry_after_delay',
          { retry_after: Math.ceil((ms - (t % ms)) / 1000), documentation_url: DOCS },
        );
      }
    }
  } catch (err) {
    if (err instanceof QuoteError) throw err;
  }
}

const bad = (message: string, extra?: Record<string, unknown>) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', {
    documentation_url: DOCS,
    ...extra,
  });

function parseInput(input: unknown): QuoteInput {
  const i = (input ?? {}) as Record<string, unknown>;
  if (!Array.isArray(i.items) || i.items.length === 0) throw bad('items[] is required');
  if (i.items.length > MAX_QUOTE_ITEMS) throw bad(`at most ${MAX_QUOTE_ITEMS} items per quote`);
  const seen = new Set<string>();
  const items = i.items.map((raw, n) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    if (typeof it.sku !== 'string' || it.sku === '') throw bad(`items[${n}].sku is required`);
    if (!Number.isInteger(it.qty) || (it.qty as number) < 1 || (it.qty as number) > 10000) {
      throw bad(`items[${n}].qty must be an integer 1..10000`);
    }
    if (it.variant !== undefined && it.variant !== null && typeof it.variant !== 'string') {
      throw bad(`items[${n}].variant must be a string`);
    }
    const k = `${it.sku}\u0000${it.variant ?? ''}`;
    if (seen.has(k)) throw bad(`duplicate item ${it.sku}: merge the quantities`);
    seen.add(k);
    return {
      sku: it.sku,
      ...(typeof it.variant === 'string' && it.variant ? { variant: it.variant } : {}),
      qty: it.qty as number,
    };
  });
  for (const k of ['shipping_option', 'delivery_slot'] as const) {
    if (i[k] != null && (typeof i[k] !== 'string' || i[k] === '' || (i[k] as string).length > 64)) {
      throw bad(`${k} must be a non-empty string up to 64 characters`);
    }
  }
  if (i.buyer_ref != null && (typeof i.buyer_ref !== 'string' || i.buyer_ref.length > 200)) {
    throw bad('buyer_ref must be a string up to 200 characters');
  }
  if (i.subscribe != null && typeof i.subscribe !== 'boolean')
    throw bad('subscribe must be a boolean');
  if (i.subscribe === true && (items.length !== 1 || items[0].qty !== 1)) {
    throw bad('subscribe: true takes exactly one item, quantity 1');
  }
  return {
    items,
    ...(i.subscribe === true ? { subscribe: true } : {}),
    ...(typeof i.shipping_option === 'string' ? { shipping_option: i.shipping_option } : {}),
    ...(typeof i.delivery_slot === 'string' ? { delivery_slot: i.delivery_slot } : {}),
    ...(typeof i.buyer_ref === 'string' ? { buyer_ref: i.buyer_ref } : {}),
  };
}

/** The shipping options a quote could name (the answer to a missing/unknown `shipping_option`). */
const shippingOffer = (products: Array<Pick<ProductRow, 'shipping_options'>>) =>
  products.flatMap((p) => p.shipping_options ?? []);

class SlotTaken extends Error {
  constructor(
    readonly sku: string,
    readonly slot: string,
  ) {
    super('delivery slot taken');
  }
}

class OutOfStock extends Error {
  constructor(
    readonly sku: string,
    readonly variant: string | undefined,
    readonly category: string | null,
    readonly available: number,
  ) {
    super('out of stock');
  }
}

async function alternativesFor(
  db: ShopTx,
  merchant_id: string,
  sku: string,
  category: string | null,
) {
  if (!category) return [];
  const rows = await db.$queryRawUnsafe<Array<{ sku: string; title: string; price_usd: string }>>(
    `SELECT sku, title, price_usd::numeric(18,2)::text AS price_usd
       FROM shop_products
      WHERE merchant_id = $1::uuid AND category = $2 AND sku <> $3 AND NOT is_test
        AND moderation_status = 'ok' AND (available IS NULL OR available - reserved > 0)
      ORDER BY created_at DESC LIMIT 3`,
    merchant_id,
    category,
    sku,
  );
  return rows;
}

function buildResponse(
  m: Pick<
    MerchantRow,
    'payout_wallet_base' | 'payout_wallet_tempo' | 'payout_pending' | 'encryption_key'
  >,
  q: {
    quote_id: string;
    order_id: string;
    items: QuoteLine[];
    total_usd: number;
    shipping_usd?: number;
    shipping_option?: string;
    delivery_slot?: string;
    expires_at: Date;
    requires_pii: string[];
    requires_human_confirmation: boolean;
    rails_offered: string[];
    subscription?: SubscriptionBinding | null;
  },
  at: number,
): QuoteResponse {
  const cfg = integratorConfig();
  const pay: QuoteResponse['pay'] = {};
  if (q.rails_offered.includes('base')) {
    const x = getX402Config();
    pay.x402 = {
      payTo: currentPayout(m, 'base', at),
      amount: toMicroUsdc(q.total_usd),
      network: x.network,
      asset: x.usdcAddress,
      extra: {
        quote_id: q.quote_id,
        ...(q.subscription?.subscription_id
          ? {
              subscription: {
                id: q.subscription.subscription_id,
                period_no: q.subscription.period_no as number,
              },
            }
          : {}),
      },
    };
  }
  if (q.rails_offered.includes('tempo')) {
    pay.mpp = { url: `${cfg.public_url}/api/v1/shop/quotes/${q.quote_id}/pay` };
  }
  return {
    quote_id: q.quote_id,
    order_id: q.order_id,
    items: q.items,
    total_usd: q.total_usd,
    ...(q.shipping_option !== undefined
      ? {
          shipping_usd: q.shipping_usd,
          shipping_option: q.shipping_option,
          ...(q.delivery_slot !== undefined ? { delivery_slot: q.delivery_slot } : {}),
        }
      : {}),
    fee_disclosed: false,
    expires_at: q.expires_at.toISOString(),
    requires_pii: q.requires_pii,
    requires_human_confirmation: q.requires_human_confirmation,
    ...(q.requires_pii.length > 0 ? { merchant_encryption_key: m.encryption_key ?? null } : {}),
    pay,
    ...(q.subscription?.plan
      ? {
          subscription_terms: {
            period: {
              unit: q.subscription.plan.period_unit,
              count: q.subscription.plan.period_count,
            },
            amount: q.subscription.plan.amount_usd,
            max_periods: q.subscription.plan.max_periods,
            renewal_window_h: RENEWAL_WINDOW_H,
            cancel_anytime: true as const,
          },
        }
      : {}),
  };
}

/** §6.1 shop.order.quote / UC-15, UC-16: price snapshot + atomic stock hold + TTL. */
export async function createQuote(
  d: ShopDeps,
  merchant_id: string,
  buyer: Buyer,
  rawInput: unknown,
  renewal?: RenewalOpts,
): Promise<QuoteResponse> {
  const t = now(d);
  const cfg = integratorConfig();
  const merchant = await loadMerchant(d.db, merchant_id);
  const banner = await assertTermsAccepted(d.db, merchant, t); // 428 / 410 first (UC-12, §11.2)

  const ban = await checkBan(buyer.identity);
  if (ban.banned) {
    throw new QuoteError(
      429,
      'banned',
      'this identity is temporarily blocked after repeated policy violations',
      'retry_after_delay',
      { retry_after: ban.retryAfterSecs, documentation_url: DOCS },
    );
  }
  await takeQuoteToken(d, buyer.identity);

  const input = parseInput(rawInput);

  const skus = input.items.map((i) => i.sku);
  const products = await d.db.$queryRawUnsafe<ProductRow[]>(
    `SELECT product_id, sku, title, price_usd::text AS price_usd, is_test, available, reserved,
            fulfillment_mode, requires_pii, category, shipping_options, delivery_slots, subscription
       FROM shop_products
      WHERE merchant_id = $1::uuid AND sku = ANY($2::text[]) AND moderation_status = 'ok'`,
    merchant_id,
    skus,
  );
  const variants = await d.db.$queryRawUnsafe<VariantRow[]>(
    `SELECT variant_id, product_id, sku, title, price_usd::text AS price_usd, available, reserved
       FROM shop_product_variants
      WHERE merchant_id = $1::uuid AND product_id = ANY($2::uuid[])`,
    merchant_id,
    products.map((p) => p.product_id),
  );

  const lines: Array<{
    line: QuoteLine;
    product: ProductRow;
    variant?: VariantRow;
    unit_cents: number;
  }> = [];
  for (const it of input.items) {
    const product = products.find((p) => p.sku === it.sku);
    if (!product) {
      throw new QuoteError(404, 'not_found', `product ${it.sku} not found`, 'use_different_tool', {
        sku: it.sku,
        documentation_url: DOCS,
      });
    }
    if (product.fulfillment_mode === 'stream') {
      throw new QuoteError(
        422,
        'validation_failed',
        `product ${it.sku} is a stream: it is bought by opening a channel at its stream.url, not by a quote`,
        'use_different_tool',
        { sku: it.sku, documentation_url: DOCS },
      );
    }
    const variant = it.variant
      ? variants.find((v) => v.product_id === product.product_id && v.sku === it.variant)
      : undefined;
    if (it.variant && !variant) {
      throw new QuoteError(
        404,
        'not_found',
        `variant ${it.variant} of ${it.sku} not found`,
        'use_different_tool',
        { sku: it.sku, documentation_url: DOCS },
      );
    }
    // A renewal keeps the price of the plan it was bought on.
    const unit_cents = renewal
      ? Math.round(renewal.plan.amount_usd * 100)
      : cents(variant?.price_usd ?? product.price_usd);
    lines.push({
      product,
      variant,
      unit_cents,
      line: {
        sku: it.sku,
        ...(it.variant ? { variant: it.variant } : {}),
        title: variant ? `${product.title} / ${variant.title}` : product.title,
        qty: it.qty,
        unit_price_usd: usd(unit_cents),
        line_total_usd: usd(unit_cents * it.qty),
      },
    });
  }

  // T-INT-41 (UC-9): a subscription item is bought as period 1 (`subscribe: true`) or renewed;
  // anything else on it, and `subscribe` on anything else, is refused.
  const subTerms = lines[0]?.product.subscription ?? null;
  let binding: SubscriptionBinding | null = null;
  if (renewal) {
    binding = {
      subscription_id: renewal.subscription_id,
      period_no: renewal.period_no,
      plan: renewal.plan,
    };
  } else if (input.subscribe) {
    if (!subTerms) {
      throw bad(`product ${lines[0].line.sku} has no subscription: omit subscribe`, {
        sku: lines[0].line.sku,
      });
    }
    binding = {
      subscribe: true,
      plan: {
        sku: lines[0].line.sku,
        title: lines[0].product.title,
        period_unit: subTerms.period_unit,
        period_count: subTerms.period_count,
        amount_usd: lines[0].unit_cents / 100,
        max_periods: subTerms.max_periods ?? null,
      },
    };
  } else if (lines.some((l) => l.product.subscription)) {
    const sku = lines.find((l) => l.product.subscription)?.line.sku;
    throw bad(`product ${sku} is a subscription: quote it alone with subscribe: true`, { sku });
  }

  // T-INT-22 (UC-4/UC-12): physical lines need a catalog shipping option and, where the product
  // offers delivery slots, one slot; the option price is the quote's `shipping`.
  const physical = lines.filter((l) => l.product.fulfillment_mode === 'physical');
  let shippingCents = 0;
  if (physical.length === 0) {
    if (input.shipping_option != null || input.delivery_slot != null) {
      throw bad('shipping_option and delivery_slot apply to physical items only');
    }
  } else {
    if (input.shipping_option == null) {
      throw bad('shipping_option is required for physical items', {
        shipping_options: shippingOffer(physical.map((l) => l.product)),
      });
    }
    for (const l of physical) {
      const opt = (l.product.shipping_options ?? []).find((o) => o.id === input.shipping_option);
      if (!opt) {
        throw bad(`shipping_option ${input.shipping_option} is not offered for ${l.line.sku}`, {
          sku: l.line.sku,
          shipping_options: shippingOffer([l.product]),
        });
      }
      shippingCents = Math.max(shippingCents, cents(String(opt.price_usd)));
    }
    const slotted = physical.filter((l) => (l.product.delivery_slots ?? []).length > 0);
    if (slotted.length > 0 && input.delivery_slot == null) {
      throw bad('delivery_slot is required: this item is delivered in slots', {
        delivery_slots: slotted.flatMap((l) => l.product.delivery_slots),
      });
    }
    if (input.delivery_slot != null) {
      if (slotted.length === 0) throw bad('these items have no delivery slots');
      for (const l of slotted) {
        if (!l.product.delivery_slots.some((sl) => sl.id === input.delivery_slot)) {
          throw bad(`delivery_slot ${input.delivery_slot} is not offered for ${l.line.sku}`, {
            sku: l.line.sku,
            delivery_slots: l.product.delivery_slots,
          });
        }
      }
    }
  }

  const is_test = lines.some((l) => l.product.is_test || l.product.sku === TEST_SKU);
  if (is_test && (lines.length !== 1 || lines[0].line.qty !== 1)) {
    throw bad('the test SKU is bought alone, quantity 1');
  }

  const subtotalCents = lines.reduce((s, l) => s + l.unit_cents * l.line.qty, 0);
  const totalCents = subtotalCents + shippingCents;
  const total = usd(totalCents);
  const limits = merchant.limits ?? {};
  if (!is_test) {
    if (total < cfg.min_order_usd) {
      throw new QuoteError(
        422,
        'below_minimum',
        `order total must be at least $${cfg.min_order_usd.toFixed(2)}`,
        'fix_request',
        { min_order_usd: cfg.min_order_usd, documentation_url: DOCS },
      );
    }
    const maxOrder = Number(limits.max_order_usd ?? DEFAULT_MAX_ORDER_USD);
    if (total > maxOrder) {
      throw new QuoteError(
        422,
        'above_max_order',
        `order total exceeds the merchant limit of $${maxOrder}`,
        'fix_request',
        { max_order_usd: maxOrder, documentation_url: DOCS },
      );
    }
    const ageDays = (t - new Date(merchant.created_at).getTime()) / 86_400_000;
    const closed = Number(merchant.reputation?.orders_closed ?? 0);
    const newCap = Number(limits.new_merchant_cap_usd ?? DEFAULT_NEW_CAP_USD);
    if (ageDays < NEW_MERCHANT_DAYS && closed < NEW_MERCHANT_ORDERS && total > newCap) {
      throw new QuoteError(
        422,
        'new_merchant_cap',
        `new merchants are limited to $${newCap} per order for the first ${NEW_MERCHANT_DAYS} days`,
        'fix_request',
        { new_merchant_cap_usd: newCap, documentation_url: DOCS },
      );
    }
  }

  const feeCents = computeFeeCents(totalCents, is_test, cfg);
  // PAY-5: with the fee on, the fee must cover x10 the settlement gas. Off => the pilot absorbs gas.
  if (cfg.fee_enabled && !is_test && usd(feeCents) < cfg.gas_estimate_usd * 10) {
    throw new QuoteError(
      422,
      'below_minimum',
      'order is too small: the fee would not cover settlement cost',
      'fix_request',
      { documentation_url: DOCS },
    );
  }

  if (is_test) {
    const used = await countPaidTestOrders24h(d.db, merchant_id, t);
    if (used >= cfg.test_sku_daily_cap) {
      throw new QuoteError(
        429,
        'test_sku_daily_cap',
        `test SKU: ${cfg.test_sku_daily_cap} paid orders per 24 hours reached`,
        'retry_after_delay',
        { documentation_url: DOCS },
      );
    }
  }

  const ttl = Math.min(
    Math.max(Math.trunc(Number(limits.quote_ttl_s ?? DEFAULT_TTL_S)) || DEFAULT_TTL_S, MIN_TTL_S),
    MAX_TTL_S,
  );
  const expires_at = new Date(t + ttl * 1000);
  // T-INT-25 (§7.1): a fee invoice unpaid 30 days past due_at switches the Base rail off for this merchant.
  const baseOff = cfg.base_orders_enabled && (await baseRailDisabled(d.db, merchant_id, t));
  const rails = [
    ...(cfg.base_orders_enabled && !baseOff ? ['base'] : []),
    ...(cfg.mpp_enabled ? ['tempo'] : []),
  ];
  if (baseOff && rails.length === 0) {
    throw new QuoteError(
      503,
      'no_rail_available',
      'no payment rail is available for this shop right now',
      'retry_after_delay',
      { documentation_url: DOCS },
    );
  }
  const humanAbove = Number(limits.human_confirm_above_usd ?? DEFAULT_HUMAN_CONFIRM_USD);
  const requires_human_confirmation = total > humanAbove;
  const requires_pii = [
    ...new Set([
      ...lines.flatMap((l) => l.product.requires_pii ?? []),
      ...(physical.length > 0 ? ['shipping_address'] : []),
    ]),
  ];
  const quote_id = randomUUID();

  let order_id: string;
  try {
    order_id = await d.transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO shop_quotes (quote_id, merchant_id, buyer_identity, items, subtotal, shipping,
            total_usd, fee_usd, rails_offered, requires_pii, requires_human_confirmation, is_test,
            expires_at, status, shipping_option, delivery_slot)
         VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::numeric, $12::numeric, $13::numeric,
                 $6::numeric, $7::text[], $8::text[], $9, $10, $11::timestamptz, 'open', $14, $15)`,
        quote_id,
        merchant_id,
        buyer.identity,
        JSON.stringify(lines.map((l) => l.line)),
        money(subtotalCents),
        money(feeCents),
        rails,
        requires_pii,
        requires_human_confirmation,
        is_test,
        expires_at.toISOString(),
        money(shippingCents),
        money(totalCents),
        physical.length > 0 ? (input.shipping_option ?? null) : null,
        physical.length > 0 ? (input.delivery_slot ?? null) : null,
      );
      const id = await createQuotedOrder(tx, {
        quote_id,
        merchant_id,
        total_usd: money(totalCents),
        fee_usd: money(feeCents),
        actor: 'buyer',
        ...(binding ? { payload: { subscription: binding } } : {}),
      });
      if (input.delivery_slot != null) {
        for (const l of physical.filter((p) => (p.product.delivery_slots ?? []).length > 0)) {
          const held = await reserveSlot(
            tx,
            { merchant_id },
            {
              product_id: l.product.product_id,
              slot_id: input.delivery_slot,
              quote_id,
              expires_at,
            },
          );
          if (!held) throw new SlotTaken(l.line.sku, input.delivery_slot);
        }
      }
      for (const l of lines) {
        const tracked = l.variant ? l.variant.available : l.product.available;
        if (tracked === null) continue; // stock not tracked: nothing to hold
        const held = await reserveStock(
          tx,
          { merchant_id },
          {
            product_id: l.product.product_id,
            variant_id: l.variant?.variant_id,
            qty: l.line.qty,
            quote_id,
            expires_at,
          },
        );
        if (!held) {
          throw new OutOfStock(
            l.line.sku,
            l.line.variant,
            l.product.category,
            Math.max(tracked - (l.variant ? l.variant.reserved : l.product.reserved), 0),
          );
        }
      }
      return id;
    });
  } catch (err) {
    if (err instanceof SlotTaken) {
      const product = physical.find((l) => l.line.sku === err.sku)?.product;
      const taken = product
        ? await takenSlots(d.db, { merchant_id }, product.product_id)
        : new Set();
      throw new QuoteError(
        409,
        'slot_unavailable',
        `delivery slot ${err.slot} is taken`,
        'fix_request',
        {
          sku: err.sku,
          alternatives: (product?.delivery_slots ?? []).filter(
            (sl) => sl.id !== err.slot && !taken.has(sl.id),
          ),
          documentation_url: DOCS,
        },
      );
    }
    if (err instanceof OutOfStock) {
      throw new QuoteError(409, 'out_of_stock', `${err.sku} is out of stock`, 'fix_request', {
        sku: err.sku,
        available: err.available,
        alternatives: await alternativesFor(d.db, merchant_id, err.sku, err.category),
        documentation_url: DOCS,
      });
    }
    throw err;
  }

  return {
    ...buildResponse(
      merchant,
      {
        quote_id,
        order_id,
        items: lines.map((l) => l.line),
        total_usd: total,
        ...(physical.length > 0
          ? {
              shipping_usd: usd(shippingCents),
              shipping_option: input.shipping_option,
              ...(input.delivery_slot != null ? { delivery_slot: input.delivery_slot } : {}),
            }
          : {}),
        expires_at,
        requires_pii,
        requires_human_confirmation,
        rails_offered: rails,
        subscription: binding,
      },
      t,
    ),
    ...banner,
  };
}

interface QuoteRow {
  quote_id: string;
  merchant_id: string;
  buyer_identity: string | null;
  items: QuoteLine[];
  total_usd: string;
  shipping_usd: string;
  shipping_option: string | null;
  delivery_slot: string | null;
  rails_offered: string[];
  requires_pii: string[];
  requires_human_confirmation: boolean;
  expires_at: Date;
  status: string;
  order_id: string | null;
  subscription: SubscriptionBinding | null;
}

async function loadQuote(db: ShopTx, quote_id: string): Promise<QuoteRow> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quote_id ?? '')) {
    throw new QuoteError(404, 'not_found', 'quote not found', 'use_different_tool');
  }
  const rows = await db.$queryRawUnsafe<QuoteRow[]>(
    `SELECT q.quote_id, q.merchant_id, q.buyer_identity, q.items, q.total_usd::float8 AS total_usd,
            q.shipping::float8 AS shipping_usd, q.shipping_option, q.delivery_slot,
            q.rails_offered, q.requires_pii, q.requires_human_confirmation, q.expires_at, q.status,
            (SELECT o.order_id FROM shop_orders o WHERE o.quote_id = q.quote_id LIMIT 1) AS order_id,
            (SELECT e.payload->'subscription' FROM shop_orders o
               JOIN shop_order_events e ON e.order_id = o.order_id AND e.seq = 1
              WHERE o.quote_id = q.quote_id LIMIT 1) AS subscription
       FROM shop_quotes q WHERE q.quote_id = $1::uuid`,
    quote_id,
  );
  if (!rows[0]) throw new QuoteError(404, 'not_found', 'quote not found', 'use_different_tool');
  return { ...rows[0], total_usd: String(rows[0].total_usd) };
}

/** Quote past its TTL: QUOTED -> EXPIRED, quote 'expired', held units released (idempotent). */
export async function expireQuote(d: ShopDeps, q: Pick<QuoteRow, 'quote_id' | 'merchant_id'>) {
  await d.transaction(async (tx) => {
    const won = await tx.$queryRawUnsafe<unknown[]>(
      `UPDATE shop_quotes SET status = 'expired'
        WHERE quote_id = $1::uuid AND status = 'open' RETURNING quote_id`,
      q.quote_id,
    );
    if (won.length > 0) {
      const o = await tx.$queryRawUnsafe<Array<{ order_id: string; state: string }>>(
        `SELECT order_id, state FROM shop_orders WHERE quote_id = $1::uuid FOR UPDATE`,
        q.quote_id,
      );
      if (o[0]?.state === 'QUOTED') {
        await transition(tx, o[0].order_id, 'EXPIRED', { actor: 'system', reason: 'quote_ttl' });
      }
    }
    await releaseReservation(tx, { merchant_id: q.merchant_id }, q.quote_id);
  });
}

/** §6.3 GET /quotes/:id. Open and live -> the §6.1 shape; expired -> 410 + a fresh quote (UC-15). */
export async function getQuote(
  d: ShopDeps,
  quote_id: string,
  buyer?: Buyer,
): Promise<QuoteResponse> {
  const t = now(d);
  const q = await loadQuote(d.db, quote_id);
  if (q.status === 'open' && new Date(q.expires_at).getTime() > t) {
    const m = await loadMerchant(d.db, q.merchant_id);
    return buildResponse(
      m,
      {
        quote_id: q.quote_id,
        order_id: q.order_id ?? '',
        items: q.items,
        total_usd: Number(q.total_usd),
        ...(q.shipping_option
          ? {
              shipping_usd: Number(q.shipping_usd),
              shipping_option: q.shipping_option,
              ...(q.delivery_slot ? { delivery_slot: q.delivery_slot } : {}),
            }
          : {}),
        expires_at: new Date(q.expires_at),
        requires_pii: q.requires_pii,
        requires_human_confirmation: q.requires_human_confirmation,
        rails_offered: q.rails_offered,
        subscription: q.subscription,
      },
      t,
    );
  }
  if (q.status === 'cancelled' || q.status === 'paid') {
    throw new QuoteError(409, 'quote_not_open', `quote is ${q.status}`, 'fix_request', {
      status: q.status,
      documentation_url: DOCS,
    });
  }

  await expireQuote(d, q);
  const again = q.items.map((l) => ({ sku: l.sku, variant: l.variant, qty: l.qty }));
  const who = buyer ?? { identity: q.buyer_identity ?? 'unknown' };
  try {
    const sub = q.subscription;
    const fresh = await createQuote(
      d,
      q.merchant_id,
      who,
      {
        items: again,
        ...(sub?.subscribe ? { subscribe: true } : {}),
        ...(q.shipping_option ? { shipping_option: q.shipping_option } : {}),
        ...(q.delivery_slot ? { delivery_slot: q.delivery_slot } : {}),
      },
      sub?.subscription_id && sub.plan
        ? {
            subscription_id: sub.subscription_id,
            period_no: sub.period_no as number,
            plan: sub.plan,
          }
        : undefined,
    );
    throw new QuoteError(
      410,
      'quote_expired',
      'quote expired; a new one is attached',
      'fix_request',
      {
        quote: fresh,
        documentation_url: DOCS,
      },
    );
  } catch (err) {
    if (err instanceof QuoteError && err.error_code === 'out_of_stock') {
      throw new QuoteError(
        410,
        'quote_expired',
        'quote expired and the items are gone',
        'fix_request',
        {
          alternatives: err.extra?.alternatives ?? [],
          documentation_url: DOCS,
        },
      );
    }
    throw err;
  }
}

/**
 * §6.1 shop.order.cancel. QUOTED: free, the quote is voided. After PAID: UC-13 -- before CONFIRMED
 * always a refund (REFUND_PENDING + a shop_refunds row due in 7 days), later only by the policy.
 */
export async function cancelOrder(
  d: ShopDeps,
  buyer: Buyer,
  order_id: string,
  reason: string,
): Promise<{ order_id: string; state: 'CANCELLED' | 'REFUND_PENDING'; refund_id?: string | null }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id ?? '')) {
    throw new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');
  }
  if (typeof reason !== 'string' || reason.trim() === '' || reason.length > 500) {
    throw bad('reason is required (up to 500 characters)');
  }
  return d.transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<
      Array<{
        state: string;
        quote_id: string;
        merchant_id: string;
        buyer_identity: string | null;
        payer_wallet: string | null;
        total_usd: string;
        settled_at: Date | null;
        close_after: Date | null;
        waive_withdrawal: boolean;
      }>
    >(
      `SELECT o.state, o.quote_id, o.merchant_id, q.buyer_identity, o.payer_wallet,
              o.total_usd::text AS total_usd, o.settled_at, o.close_after, q.waive_withdrawal
         FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
        WHERE o.order_id = $1::uuid FOR UPDATE OF o`,
      order_id,
    );
    const o = rows[0];
    // QUOTED: the quote's buyer. Paid orders: the payer (quote buyer or the paying wallet's identity).
    const mine =
      o &&
      (o.state === 'QUOTED'
        ? !o.buyer_identity || o.buyer_identity === buyer.identity
        : isPayer(o, buyer.identity));
    if (!o || !mine) {
      throw new QuoteError(404, 'not_found', 'order not found', 'use_different_tool');
    }
    if (o.state === 'CANCELLED') return { order_id, state: 'CANCELLED' as const };
    if (o.state !== 'QUOTED') {
      if (['PAYING', 'PAYMENT_FAILED', 'EXPIRED'].includes(o.state)) {
        throw new QuoteError(
          409,
          'not_cancellable',
          `order is ${o.state}: not cancellable`,
          'use_different_tool',
          { state: o.state, documentation_url: DOCS },
        );
      }
      return cancelPaidOrder(tx, { ...o, order_id }, reason.trim(), (d.now ?? Date.now)());
    }
    await transition(tx, order_id, 'CANCELLED', { actor: 'buyer', reason: reason.trim() });
    await tx.$executeRawUnsafe(
      `UPDATE shop_quotes SET status = 'cancelled' WHERE quote_id = $1::uuid AND status = 'open'`,
      o.quote_id,
    );
    await releaseReservation(tx, { merchant_id: o.merchant_id }, o.quote_id);
    return { order_id, state: 'CANCELLED' as const };
  });
}
