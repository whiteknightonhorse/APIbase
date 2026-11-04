import { logger } from '../config/logger';
import { defaultShopDeps, type ShopDeps } from '../shop/merchant-lifecycle.service';
import { LEGAL_DOC_IDS } from '../shop/legal/legal-docs';

/** email_events.msg_id (primary key = dedup) of one notice. Parsed back by merchant-mail.py. */
export const legalNoticeKey = (merchant_id: string, doc_id: string, version: string): string =>
  `legal-notice:${merchant_id}:${doc_id}:${version}`;

/**
 * `legal-notice` (worker, daily 05:10 UTC), LEGAL-REGRESS-1104 ruling-1: for every registry row with
 * effective_from in the future and every active merchant, queue ONE merchant e-mail
 * (template `legal_version_notice`, sent by scripts/autopilot/merchant-mail.py) and, only when the
 * row was newly queued, one outbox event `shop.legal.new_version`. Idempotent: the key is the
 * existing email_events primary key `msg_id`, so a rerun inserts nothing.
 */
export async function runLegalNotice(
  d: ShopDeps = defaultShopDeps(),
  nowMs: number = Date.now(),
): Promise<{ queued: number; scheduled: number; merchants: number }> {
  const at = new Date(nowMs).toISOString();
  const scheduled = await d.db.$queryRawUnsafe<
    Array<{ doc_id: string; version: string; effective_from: Date | string }>
  >(
    `SELECT doc_id, version, effective_from FROM shop_legal_docs
      WHERE doc_id = ANY($1::text[]) AND effective_from > $2::timestamptz
      ORDER BY doc_id, effective_from, version`,
    [...LEGAL_DOC_IDS],
    at,
  );
  const merchants = await d.db.$queryRawUnsafe<Array<{ merchant_id: string }>>(
    `SELECT merchant_id::text AS merchant_id FROM shop_merchants WHERE status = 'active' ORDER BY merchant_id`,
  );
  let queued = 0;
  for (const m of merchants) {
    for (const s of scheduled) {
      const msg_id = legalNoticeKey(m.merchant_id, s.doc_id, s.version);
      queued += await d.transaction(async (tx) => {
        const n = await tx.$executeRawUnsafe(
          `INSERT INTO email_events (msg_id, received_at, from_domain, class, action_required, summary,
                                     direction, status, kind, merchant_id, template)
           VALUES ($1, now(), 'apibase.pro', 'UNMATCHED', FALSE, NULL, 'out', 'queued', 'legal_version_notice',
                   $2::uuid, 'legal_version_notice')
           ON CONFLICT (msg_id) DO NOTHING`,
          msg_id,
          m.merchant_id,
        );
        if (n === 0) return 0;
        await tx.$executeRawUnsafe(
          `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb)`,
          'shop.legal.new_version',
          JSON.stringify({
            merchant_id: m.merchant_id,
            doc_id: s.doc_id,
            version: s.version,
            effective_from: new Date(s.effective_from).toISOString(),
            msg_id,
          }),
        );
        return 1;
      });
    }
  }
  logger.info(
    { job: 'legal-notice', queued, scheduled: scheduled.length, merchants: merchants.length },
    'legal version notices queued',
  );
  return { queued, scheduled: scheduled.length, merchants: merchants.length };
}
