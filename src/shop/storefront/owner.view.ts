import { layout } from '../integrator/layout';
import type { OwnerView } from '../owner.service';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid';
  }
};

/** F-1 owner page: read-only, no form, no script, never indexed. */
export function ownerHtml(v: OwnerView): string {
  const m = v.merchant;
  const rows = v.orders
    .map(
      (o) =>
        `<tr><td><code>${esc(o.order_id)}</code></td><td>${esc(o.state)}</td><td>${esc(o.rail ?? '')}</td>` +
        `<td>${esc(o.total_usd)}</td><td>${esc(o.fee_usd)}</td><td>${esc(o.created_at)}</td>` +
        `<td><code>${esc(o.tx_hash ?? '')}</code></td></tr>`,
    )
    .join('');
  const hooks = v.webhook.endpoints
    .map(
      (e) =>
        `<li>${esc(host(e.url))}: ${esc(e.status)}, ${esc(e.failures_in_row)} failures in a row</li>`,
    )
    .join('');
  const invoices = v.fee.open_invoices
    .map(
      (i) =>
        `<li><code>${esc(i.invoice_id)}</code> · ${esc(i.period)} · ${esc(i.amount_usd)} USD · due ${esc(i.due_at)} · ${esc(i.status)}</li>`,
    )
    .join('');
  const w = v.webhook;
  const body =
    `<h1>${esc(m.name)} — owner view</h1>` +
    `<p>Read-only. Status: <strong>${esc(m.status)}</strong>${m.status_reason ? ` (${esc(m.status_reason)})` : ''}. ` +
    `This session ends 15 minutes after you signed.</p>` +
    `<h2>Platform fee</h2><p>Owed: ${esc(v.fee.owed_usd)} USD · Invoiced: ${esc(v.fee.invoiced_usd)} USD · Collected: ${esc(v.fee.collected_usd)} USD</p>` +
    (invoices ? `<h3>Open fee invoices</h3><ul>${invoices}</ul>` : '') +
    `<h2>Webhook health (30 days)</h2><p>Deliveries: ${esc(w.deliveries)} · Success: ${esc(w.success_pct ?? 'n/a')}% · p95: ${esc(w.p95_delivery_ms ?? 'n/a')} ms</p>` +
    (hooks ? `<ul>${hooks}</ul>` : '<p>No webhook endpoint registered.</p>') +
    `<h2>Last ${v.orders.length} orders</h2>` +
    `<table><thead><tr><th>Order</th><th>State</th><th>Rail</th><th>Total USD</th><th>Fee USD</th><th>Created</th><th>Tx</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
  return layout({
    title: `${esc(m.name)} owner view — APIbase`,
    head: '<meta name="robots" content="noindex, nofollow">',
    path: `/m/${m.slug}/owner`,
    body,
    footer: 'APIbase.pro · Shops · <a href="/integrator">Sell to AI agents</a>',
  });
}
