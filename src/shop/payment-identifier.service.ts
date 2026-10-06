/**
 * T-INT-48: x402 `payment-identifier` idempotency for `shop.order.pay` (`quote:*` only).
 * One identifier = one answer (R8 "x402 duplicate/in-flight/conflict semantics"): the same id with
 * the same request returns the stored response without verify/settle; the same id with another
 * request or another payer is 409 `payment_identifier_conflict`; the same id while the first
 * request still runs is 409 `payment_in_flight`. A request without the extension is not touched.
 * Rows live in `shop_payment_identifiers` (0027) and are written outside the ESCROW transaction,
 * so a concurrent request sees `in_flight` at once; the INT-12 sweeper deletes expired rows.
 */
import { createHash } from 'node:crypto';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { parsePaymentPayload } from '@x402/core/schemas';
import { type PipelineContext, type PipelineError, type Result, ok, err } from '../pipeline/types';
import type { ShopDeps } from './merchant-lifecycle.service';

// @x402/extensions/payment-identifier: TS can't resolve subpath exports but module exists at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const piMod = require('@x402/extensions/payment-identifier') as any;

export const PAYMENT_IDENTIFIER_TTL_HOURS = 24;

/** The `extensions` entry a `quote:*` 402 offers: the identifier is optional for the payer. */
export function declareOrderPaymentIdentifier(): Record<string, unknown> {
  return { [piMod.PAYMENT_IDENTIFIER]: piMod.declarePaymentIdentifierExtension(false) };
}

interface Presented {
  id: string;
  payer: string;
  fingerprint: string;
}

/** The identifier of this payment, its (claimed, unverified) payer and the request fingerprint. */
function readPresented(ctx: PipelineContext): Presented | null {
  if (!ctx.x402PaymentHeader) return null;
  let payload: unknown;
  try {
    const parsed = parsePaymentPayload(decodePaymentSignatureHeader(ctx.x402PaymentHeader));
    if (!parsed.success) return null;
    payload = parsed.data;
  } catch {
    return null;
  }
  const id = piMod.extractPaymentIdentifier(payload, true) as string | null;
  if (!id) return null;
  const p = payload as {
    accepted?: { network?: unknown };
    payload?: { authorization?: { from?: unknown; to?: unknown; value?: unknown } };
  };
  const auth = p.payload?.authorization;
  const quoteId = String((ctx.body as { quote_id?: unknown } | undefined)?.quote_id ?? '');
  const fingerprint = createHash('sha256')
    .update([quoteId, String(auth?.value), String(auth?.to).toLowerCase(), 'base'].join('|'))
    .digest('hex');
  return { id, payer: String(auth?.from ?? '').toLowerCase(), fingerprint };
}

const conflict = (
  code: 'payment_identifier_conflict' | 'payment_in_flight',
  message: string,
): PipelineError => ({ code: 409, error: code, message });

type PayValue = { order_id: string; state: string; tx_hash?: string | null; fulfillment?: string };
type Stored = { ok: true; value: PayValue } | { ok: false; error: PipelineError };

/** The stored response never carries `fulfillment`: it is handed out by `order.get` (§8.2). */
function toStored(res: Result<PayValue, PipelineError>): Stored | null {
  if (res.ok) {
    const { order_id, state, tx_hash } = res.value;
    return { ok: true, value: { order_id, state, tx_hash: tx_hash ?? null } };
  }
  // Only a refused payment (402) is an answer worth keeping; 410/429/503 are retried with the id.
  return res.error.code === 402 ? { ok: false, error: res.error } : null;
}

/**
 * Wraps ESCROW for `quote:*`: `run` is the whole pre-existing pipeline and is called at most
 * once per identifier.
 */
export async function withPaymentIdentifier<T extends PayValue>(
  deps: ShopDeps,
  ctx: PipelineContext,
  run: () => Promise<Result<T, PipelineError>>,
): Promise<Result<T, PipelineError>> {
  const presented = ctx.mppPaid ? null : readPresented(ctx);
  if (!presented) return run();
  const { id, payer, fingerprint } = presented;

  for (let attempt = 0; attempt < 3; attempt++) {
    const inserted = await deps.db.$queryRawUnsafe<Array<{ identifier: string }>>(
      `INSERT INTO shop_payment_identifiers (identifier, payer, request_fingerprint, status, expires_at)
       VALUES ($1, $2, $3, 'in_flight', now() + make_interval(hours => $4::int))
       ON CONFLICT (identifier) DO NOTHING
       RETURNING identifier`,
      id,
      payer,
      fingerprint,
      PAYMENT_IDENTIFIER_TTL_HOURS,
    );
    if (inserted.length > 0) break;
    const rows = await deps.db.$queryRawUnsafe<
      Array<{ payer: string; request_fingerprint: string; status: string; response: Stored | null }>
    >(
      `SELECT payer, request_fingerprint, status, response FROM shop_payment_identifiers
        WHERE identifier = $1 AND expires_at > now()`,
      id,
    );
    const row = rows[0];
    if (!row) {
      // Expired or just deleted by a failed first request: clear a stale row and try again.
      await deps.db.$executeRawUnsafe(
        `DELETE FROM shop_payment_identifiers WHERE identifier = $1 AND expires_at <= now()`,
        id,
      );
      if (attempt === 2) return err(conflict('payment_in_flight', 'Retry the payment shortly.'));
      continue;
    }
    if (row.payer !== payer || row.request_fingerprint !== fingerprint) {
      return err(
        conflict(
          'payment_identifier_conflict',
          'This payment identifier was already used for a different payment request.',
        ),
      );
    }
    if (row.status === 'done' && row.response) {
      const s = row.response;
      return s.ok ? ok(s.value as T) : err(s.error);
    }
    return err(
      conflict('payment_in_flight', 'A payment with this identifier is already being processed.'),
    );
  }

  let res: Result<T, PipelineError>;
  try {
    res = await run();
  } catch (e) {
    // A thrown pipeline must not block the identifier for 24 hours.
    await deps.db
      .$executeRawUnsafe(`DELETE FROM shop_payment_identifiers WHERE identifier = $1`, id)
      .catch(() => undefined);
    throw e;
  }
  const stored = toStored(res);
  if (stored) {
    await deps.db.$executeRawUnsafe(
      `UPDATE shop_payment_identifiers SET status = 'done', response = $2::jsonb WHERE identifier = $1`,
      id,
      JSON.stringify(stored),
    );
  } else {
    await deps.db.$executeRawUnsafe(
      `DELETE FROM shop_payment_identifiers WHERE identifier = $1`,
      id,
    );
  }
  return res;
}
