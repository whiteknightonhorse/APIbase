import { config } from '../../config';
import { decryptSecret, encryptSecret } from '../../services/secret-crypto.service';
import type { ShopDeps } from '../merchant-lifecycle.service';
import { transition } from '../order-state';

const DEFAULT_REFUND_WINDOW_DAYS = 14;
const TEST_SKU_TEXT = 'test ok';

export interface ShopOrderResult {
  state: string;
  fulfillment?: string;
}

interface Row {
  state: string;
  quote_id: string;
  merchant_id: string;
  items: Array<{ sku: string }>;
  waive_withdrawal: boolean;
  is_test: boolean;
  fulfillment_payload_enc: string | null;
}

interface ProductRow {
  sku: string;
  fulfillment_mode: string;
  fulfillment_payload_encrypted: string | null;
  refund_window_days: number | null;
}

/**
 * PROVIDER_CALL for the internal `shop` provider (§2 item 5): an order that is PAID is delivered.
 * instant: PAID -> CONFIRMED -> FULFILLED (the payload is decrypted once and kept, re-encrypted,
 * on the order for a repeated `shop.order.get`); `waive_withdrawal` -> CLOSED at once, else
 * `close_after = now + refund_window_days`. `merchant`/`physical` stay PAID (INT-12 / INT-14).
 * Idempotent: only a PAID order is touched, under the row lock, so delivery happens exactly once.
 */
export async function fulfillPaidOrder(deps: ShopDeps, order_id: string): Promise<ShopOrderResult> {
  return deps.transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Row[]>(
      `SELECT o.state, o.quote_id, o.merchant_id, q.items, q.waive_withdrawal, q.is_test,
              o.fulfillment_payload_enc
         FROM shop_orders o JOIN shop_quotes q ON q.quote_id = o.quote_id
        WHERE o.order_id = $1::uuid FOR UPDATE OF o`,
      order_id,
    );
    const o = rows[0];
    if (!o) return { state: 'UNKNOWN' };
    if (o.state !== 'PAID') return { state: o.state };

    const key = config.ENCRYPTION_KEY;
    let text: string | undefined;
    let windowDays = DEFAULT_REFUND_WINDOW_DAYS;
    if (o.is_test) {
      text = TEST_SKU_TEXT;
    } else {
      const products = await tx.$queryRawUnsafe<ProductRow[]>(
        `SELECT sku, fulfillment_mode, fulfillment_payload_encrypted, refund_window_days
           FROM shop_products WHERE merchant_id = $1::uuid AND sku = ANY($2::text[])`,
        o.merchant_id,
        o.items.map((i) => i.sku),
      );
      if (products.length === 0 || products.some((p) => p.fulfillment_mode !== 'instant')) {
        return { state: o.state };
      }
      const parts = products
        .filter((p) => p.fulfillment_payload_encrypted)
        .map((p) => decryptSecret(p.fulfillment_payload_encrypted as string, key));
      text = parts.length > 0 ? parts.join('\n') : undefined;
      windowDays = Math.max(
        0,
        ...products.map((p) => p.refund_window_days ?? DEFAULT_REFUND_WINDOW_DAYS),
      );
    }

    await transition(tx, order_id, 'CONFIRMED', { actor: 'system', reason: 'instant' });
    await transition(tx, order_id, 'FULFILLED', { actor: 'system', reason: 'instant_delivered' });
    if (text !== undefined) {
      await tx.$executeRawUnsafe(
        `UPDATE shop_orders SET fulfillment_payload_enc = $2 WHERE order_id = $1::uuid`,
        order_id,
        encryptSecret(text, key),
      );
    }
    let state = 'FULFILLED';
    if (o.waive_withdrawal) {
      await transition(tx, order_id, 'CLOSED', { actor: 'system', reason: 'withdrawal_waived' });
      await tx.$executeRawUnsafe(
        `UPDATE shop_orders SET close_after = now() WHERE order_id = $1::uuid`,
        order_id,
      );
      state = 'CLOSED';
    } else {
      await tx.$executeRawUnsafe(
        `UPDATE shop_orders SET close_after = now() + ($2::int * interval '1 day')
          WHERE order_id = $1::uuid`,
        order_id,
        windowDays,
      );
    }
    return { state, ...(text !== undefined ? { fulfillment: text } : {}) };
  });
}
