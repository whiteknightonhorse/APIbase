import type { ShopTx } from './db';

export interface MerchantMail {
  merchant_id: string;
  /** A kind of scripts/autopilot/merchant-mail.py KINDS. */
  template: string;
  msg_id: string;
  /**
   * T-0890: the address the notice must reach when it is not the shop's current contact e-mail.
   * Kept only while the row is queued: the email_events_clear_to_override trigger (migration 0061)
   * sets it to NULL when the row is sent, failed or skipped.
   */
  to_override?: string;
}

/** Queues one outbound merchant mail (sent by merchant-mail.py); a repeated msg_id writes nothing. */
export const queueMerchantMail = (tx: ShopTx, m: MerchantMail) =>
  tx.$executeRawUnsafe(
    `INSERT INTO email_events (msg_id, received_at, from_domain, class, action_required, summary,
                               direction, status, kind, merchant_id, template, to_override)
     VALUES ($1, now(), 'apibase.pro', 'UNMATCHED', FALSE, NULL, 'out', 'queued', $2, $3::uuid, $2, $4)
     ON CONFLICT (msg_id) DO NOTHING`,
    m.msg_id,
    m.template,
    m.merchant_id,
    m.to_override ?? null,
  );
