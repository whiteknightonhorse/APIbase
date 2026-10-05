import { randomUUID } from 'node:crypto';
import { config } from '../config';
import {
  X_APIBASE_DELIVERY_ID,
  X_APIBASE_EVENT,
  X_APIBASE_SIGNATURE,
} from '../config/http-headers';
import { decryptSecret } from '../services/secret-crypto.service';
import type { ShopDeps } from './merchant-lifecycle.service';
import { toApiError } from './merchant-lifecycle.service';
import {
  loadStorefront,
  selfTestStorefront,
  STOREFRONT_TOOL_NAMES,
  storefrontServerName,
  type StorefrontMerchant,
} from './merchant-mcp-server';
import { cancelOrder, createQuote } from './quote.service';
import { PUBLIC_BASE, StorefrontError } from './storefront/storefront.service';
import { defaultResolver, resolvePublicTarget, type HostResolver } from './webhook/ssrf';
import { httpsTransport, WEBHOOK_TIMEOUT_MS, type WebhookTransport } from './webhook/transport';
import { signPayload } from './webhook/webhook.service';

/**
 * F-17 / UC-10: "is this merchant connected?". Steps run in order; a step whose prerequisite failed
 * is `skipped`. `connected` needs the first four steps without a failure (the webhook counts as
 * skipped only when the merchant has no endpoint); `payment_verified` (a PAID test order made by
 * the merchant's own agent) is reported separately and does not gate `connected`.
 */
export const CHECK_STEP_NAMES = [
  'storefront_initialize',
  'tools_list_6',
  'quote_test_sku',
  'webhook_ping',
  'payment_verified',
] as const;
export type CheckStepName = (typeof CHECK_STEP_NAMES)[number];

export interface CheckStep {
  name: CheckStepName;
  status: 'ok' | 'fail' | 'skipped';
  /** Machine-readable reason (never contains a URL, address or response body). */
  code?: string;
  /** Private to the key holder; absent from the public report. */
  detail?: string;
}

export interface CheckReport {
  status: 'connected' | 'incomplete';
  steps: CheckStep[];
  payment_verified: boolean;
  public_url: string;
  mcp_url: string;
  suggested_action?: string;
  documentation_url?: string;
}

export interface PublicCheckReport {
  slug: string;
  status: 'connected' | 'incomplete';
  steps: Array<Pick<CheckStep, 'name' | 'status' | 'code'>>;
  payment_verified: boolean;
  generated_at: string;
}

export interface CheckDeps extends ShopDeps {
  resolve?: HostResolver;
  transport?: WebhookTransport;
  timeoutMs?: number;
  /** Test seam: replaces the in-process initialize + tools/list of the storefront. */
  selfTest?: typeof selfTestStorefront;
}

const DOCS = '/docs/integrator#connect-check';

const step = (name: CheckStepName, status: CheckStep['status'], code?: string, detail?: string) =>
  ({ name, status, ...(code ? { code } : {}), ...(detail ? { detail } : {}) }) as CheckStep;

async function pingWebhook(d: CheckDeps, merchant_id: string): Promise<CheckStep> {
  const rows = await d.db.$queryRawUnsafe<Array<{ url: string; secret_enc: string | null }>>(
    `SELECT url, secret_enc FROM shop_webhook_endpoints
      WHERE merchant_id = $1::uuid AND status = 'active' ORDER BY created_at LIMIT 1`,
    merchant_id,
  );
  const ep = rows[0];
  if (!ep) {
    return step('webhook_ping', 'skipped', 'no_webhook_endpoint', 'register one: webhook_set');
  }
  if (!ep.secret_enc) return step('webhook_ping', 'fail', 'webhook_secret_missing');
  try {
    const target = await resolvePublicTarget(ep.url, d.resolve ?? defaultResolver);
    const secret = decryptSecret(ep.secret_enc, config.ENCRYPTION_KEY);
    const id = randomUUID();
    const now = (d.now ?? Date.now)();
    const body = JSON.stringify({
      id,
      event: 'ping',
      created_at: new Date(now).toISOString(),
      data: {},
    });
    const timeoutMs = d.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
    let timer: NodeJS.Timeout | undefined;
    const res = await Promise.race([
      (d.transport ?? httpsTransport)({
        target,
        timeoutMs,
        body,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'APIbase-Webhooks/1',
          [X_APIBASE_EVENT]: 'ping',
          [X_APIBASE_DELIVERY_ID]: id,
          [X_APIBASE_SIGNATURE]: signPayload(secret, Math.floor(now / 1000), body),
        },
      }),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error('timeout')), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
    return res.status >= 200 && res.status < 300
      ? step('webhook_ping', 'ok')
      : step('webhook_ping', 'fail', 'webhook_not_2xx', `the endpoint answered ${res.status}`);
  } catch (err) {
    const msg = (err as Error).message;
    const code = msg === 'timeout' ? 'webhook_timeout' : 'webhook_unreachable';
    return step('webhook_ping', 'fail', code, msg.slice(0, 200));
  }
}

async function quoteTestSku(d: CheckDeps, merchant_id: string): Promise<CheckStep> {
  const rows = await d.db.$queryRawUnsafe<Array<{ sku: string }>>(
    `SELECT sku FROM shop_products
      WHERE merchant_id = $1::uuid AND is_test AND moderation_status = 'ok' LIMIT 1`,
    merchant_id,
  );
  const sku = rows[0]?.sku;
  if (!sku) return step('quote_test_sku', 'fail', 'no_test_sku', 'upsert the __apibase_test item');
  const buyer = { identity: `merchant-check:${merchant_id}` };
  try {
    const q = await createQuote(d, merchant_id, buyer, { items: [{ sku, qty: 1 }] });
    // a check must not hold stock: the quote is voided at once (QUOTED -> CANCELLED, free)
    await cancelOrder(d, buyer, q.order_id, 'storefront check').catch(() => undefined);
    return step('quote_test_sku', 'ok');
  } catch (err) {
    const body = toApiError(err).body;
    return step(
      'quote_test_sku',
      'fail',
      String(body.error_code ?? 'quote_failed'),
      String(body.message ?? ''),
    );
  }
}

async function paymentVerified(d: CheckDeps, merchant_id: string): Promise<boolean> {
  const rows = await d.db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
      WHERE o.merchant_id = $1::uuid AND q.is_test
        AND o.state NOT IN ('QUOTED', 'EXPIRED', 'CANCELLED', 'PAYING', 'PAYMENT_FAILED')
      LIMIT 1`,
    merchant_id,
  );
  return rows.length > 0;
}

/** Runs the F-17 check for one merchant (the caller has authenticated the key or the slug). */
export async function runCheck(d: CheckDeps, merchant_id: string): Promise<CheckReport> {
  const slugRows = await d.db.$queryRawUnsafe<Array<{ slug: string }>>(
    `SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`,
    merchant_id,
  );
  const slug = slugRows[0]?.slug ?? '';
  const steps: CheckStep[] = [];

  let merchant: StorefrontMerchant | undefined;
  try {
    merchant = await loadStorefront(d.db, slug, { fresh: true, now: (d.now ?? Date.now)() });
  } catch (err) {
    const code =
      err instanceof StorefrontError && err.status === 410
        ? 'merchant_unavailable'
        : 'merchant_not_active';
    steps.push(
      step('storefront_initialize', 'fail', code, 'the merchant must be active (accept terms)'),
    );
  }

  if (merchant) {
    try {
      const t = await (d.selfTest ?? selfTestStorefront)(merchant, d);
      const nameOk = t.server_name === storefrontServerName(merchant);
      steps.push(
        nameOk
          ? step('storefront_initialize', 'ok')
          : step('storefront_initialize', 'fail', 'server_info_mismatch', t.server_name),
      );
      const exact =
        t.tools.length === STOREFRONT_TOOL_NAMES.length &&
        STOREFRONT_TOOL_NAMES.every((n) => t.tools.includes(n));
      steps.push(
        exact
          ? step('tools_list_6', 'ok')
          : step(
              'tools_list_6',
              'fail',
              'tools_mismatch',
              `got ${t.tools.length}: ${t.tools.join(', ')}`,
            ),
      );
    } catch (err) {
      steps.push(
        step(
          'storefront_initialize',
          'fail',
          'initialize_failed',
          (err as Error).message.slice(0, 200),
        ),
      );
      steps.push(step('tools_list_6', 'skipped', 'initialize_failed'));
    }
  } else {
    steps.push(step('tools_list_6', 'skipped', 'initialize_failed'));
  }

  const upOk = steps.every((s) => s.status === 'ok');
  steps.push(
    upOk
      ? await quoteTestSku(d, merchant_id)
      : step('quote_test_sku', 'skipped', 'storefront_unavailable'),
  );
  steps.push(await pingWebhook(d, merchant_id));
  const verified = await paymentVerified(d, merchant_id);
  steps.push(
    verified
      ? step('payment_verified', 'ok')
      : step('payment_verified', 'skipped', 'no_paid_test_order'),
  );

  const gating = steps.slice(0, 4);
  const connected = gating.every(
    (s) => s.status === 'ok' || (s.name === 'webhook_ping' && s.status === 'skipped'),
  );
  const failed = steps.find((s) => s.status === 'fail');
  return {
    status: connected ? 'connected' : 'incomplete',
    steps,
    payment_verified: verified,
    public_url: `${PUBLIC_BASE}/integrator/check/${slug}`,
    mcp_url: `${PUBLIC_BASE}/mcp/m/${slug}`,
    ...(failed ? { suggested_action: 'fix_request', documentation_url: `${DOCS}` } : {}),
  };
}

/** The public face: step names, statuses and codes only (no detail, no URLs, no bodies). */
export function toPublicReport(slug: string, r: CheckReport, now: number): PublicCheckReport {
  return {
    slug,
    status: r.status,
    steps: r.steps.map(({ name, status, code }) => ({ name, status, ...(code ? { code } : {}) })),
    payment_verified: r.payment_verified,
    generated_at: new Date(now).toISOString(),
  };
}
