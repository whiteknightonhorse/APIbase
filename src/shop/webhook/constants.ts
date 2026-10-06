/** Dependency-free webhook constants (the outbox processor imports this, nothing heavier). */

/** F-6: retry after 1 min, 5 min, 30 min, 2 h, 12 h, 24 h; 2xx = delivered. */
export const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000, 86_400_000];
/** attempt 1 + one attempt per retry delay */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** §14: after this many failures in a row an endpoint is only tried on the retry schedule. */
export const BREAKER_THRESHOLD = 10;

/**
 * outbox event_type -> webhook event name. The two SLA notices are not subscribable (F-6): they are
 * pull-only through GET /merchants/me/events (`ship_overdue` is the third). refund.verified and dispute.opened (INT-23) are subscribable; dispute.unanswered is pull-only.
 */
export const OUTBOX_TO_WEBHOOK: Record<string, string> = {
  'shop.order.paid': 'order.paid',
  'shop.order.confirmed': 'order.confirmed',
  'shop.order.cancelled': 'order.cancelled',
  'shop.refund.requested': 'refund.requested',
  'shop.catalog.rejected': 'catalog.rejected',
  'shop.merchant.key_rotated': 'merchant.key_rotated',
  'shop.merchant.keys_reissued': 'merchant.keys_reissued',
  'shop.order.shipped': 'order.shipped',
  'shop.order.delivered': 'order.delivered',
  'shop.order.confirm_overdue': 'order.confirm_overdue',
  'shop.order.ship_overdue': 'order.ship_overdue',
  'shop.refund.overdue': 'refund.overdue',
  'shop.refund.verified': 'refund.verified',
  'shop.dispute.opened': 'dispute.opened',
  'shop.subscription.started': 'subscription.started',
  'shop.subscription.renewed': 'subscription.renewed',
  'shop.subscription.past_due': 'subscription.past_due',
  'shop.subscription.canceled': 'subscription.canceled',
  'shop.subscription.expired': 'subscription.expired',
};
