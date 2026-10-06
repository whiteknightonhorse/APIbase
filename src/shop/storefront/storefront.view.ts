import { layout } from '../integrator/layout';
import {
  mcpUrl,
  PUBLIC_BASE,
  REST_BASE,
  type CartLine,
  type PublicProduct,
  type PublicProductCard,
  type PublicShop,
} from './storefront.service';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** JSON for an inline <script type="application/ld+json">: `<` can never close the tag. */
const ldJson = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');
const ldScripts = (ld: unknown[]) =>
  ld.map((o) => `<script type="application/ld+json">${ldJson(o)}</script>`).join('');

const NOINDEX = '<meta name="robots" content="noindex, follow">';
const FOOTER = 'APIbase.pro · Shops · <a href="/integrator">Sell to AI agents</a>';

const kv = (o: Record<string, unknown>): Array<[string, string]> =>
  Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);

const shopUrl = (slug: string) => `${PUBLIC_BASE}/m/${slug}`;
const productUrl = (slug: string, sku: string) => `${shopUrl(slug)}/p/${encodeURIComponent(sku)}`;
const domainNote = (s: PublicShop) => (s.domain_verified ? 'domain_verified' : 'unverified_domain');

/** Human labels for known policy keys; an unknown key is shown raw, nothing is dropped. */
const POLICY_LABELS: Record<string, { label: string; value: (v: string) => string }> = {
  confirm_sla_h: { label: 'Order confirmation', value: (v) => `within ${v} hours` },
};

const offerLd = (slug: string, p: PublicProduct) => ({
  '@type': 'Offer',
  url: productUrl(slug, p.sku),
  sku: p.sku,
  name: p.title,
  price: p.price_usd,
  priceCurrency: 'USD',
  availability:
    p.availability === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
  potentialAction: { '@type': 'BuyAction', target: mcpUrl(slug) },
});

const page = (
  title: string,
  path: string,
  body: string,
  o: { noindex?: boolean; ld?: unknown[] } = {},
) =>
  layout({
    title: `${esc(title)} — APIbase`,
    head: (o.noindex ? NOINDEX : '') + ldScripts(o.ld ?? []),
    path,
    body,
    footer: FOOTER,
  });

const codeBlock = (url: string) => `<div class="code-wrap"><pre>${esc(url)}</pre></div>`;

// ---- /shops ----
interface ShopsResult {
  shops: PublicShop[];
  page: number;
  page_size: number;
  total: number;
}
const pageCount = (r: ShopsResult) => Math.max(1, Math.ceil(r.total / r.page_size));

export function shopsHtml(r: ShopsResult): string {
  const pages = pageCount(r);
  const nav =
    (r.page > 1 ? `<a href="/shops?page=${r.page - 1}">prev</a> ` : '') +
    (r.page < pages ? `<a href="/shops?page=${r.page + 1}">next</a>` : '');
  const rows = r.shops
    .map(
      (s) =>
        `<tr><td><a href="/m/${esc(s.slug)}">${esc(s.name)}</a></td><td>${esc(s.category)}</td></tr>`,
    )
    .join('');
  const body =
    `<div class="sys-monitor"><span class="prompt">></span> <span class="label">SHOPS:</span><strong>${r.total}</strong>  <span class="label">PAGE:</span><strong>${r.page}/${pages}</strong></div>` +
    `<h1>Shops</h1><div class="table-wrap"><table><tr><th>Shop</th><th>Category</th></tr>${rows}</table></div>` +
    `<p>${nav}</p>`;
  return page('Shops', '/shops', body);
}

export function shopsMarkdown(r: ShopsResult): string {
  return `# Shops\n\n${r.shops.map((s) => `- [${s.name}](${shopUrl(s.slug)}) — ${s.category}`).join('\n')}\n\npage ${r.page}/${pageCount(r)}\n`;
}

// ---- /m/<slug> ----
export function shopMarkdown(s: PublicShop, products: PublicProduct[]): string {
  return [
    `# ${s.name}`,
    '',
    `- category: ${s.category}`,
    `- site: ${s.site_url}`,
    `- domain: ${domainNote(s)}`,
    `- storefront (MCP): ${mcpUrl(s.slug)}`,
    ...kv(s.reputation).map(([k, v]) => `- reputation.${k}: ${v}`),
    ...kv(s.policy).map(([k, v]) =>
      POLICY_LABELS[k]
        ? `- ${POLICY_LABELS[k].label.toLowerCase()}: ${POLICY_LABELS[k].value(v)}`
        : `- policy.${k}: ${v}`,
    ),
    '',
    '## Products',
    '',
    ...products.map(
      (p) => `- [${p.title}](${productUrl(s.slug, p.sku)}) — $${p.price_usd} (${p.availability})`,
    ),
    '',
  ].join('\n');
}

export function shopHtml(s: PublicShop, products: PublicProduct[]): string {
  const slug = esc(s.slug);
  const sla = s.policy.confirm_sla_h;
  const monitor =
    `<div class="sys-monitor"><span class="prompt">></span> <span class="label">SHOP:</span><strong>${slug}</strong>  ` +
    `<span class="label">CATEGORY:</span><strong>${esc(s.category)}</strong>  ` +
    `<span class="label">ITEMS:</span><strong>${products.length}</strong>  ` +
    `<span class="label">RAILS:</span><strong>x402+MPP</strong>` +
    (sla !== undefined
      ? ` <span class="label">CONFIRM SLA:</span><strong>${esc(sla)}h</strong>`
      : '') +
    '</div>';
  const cards = products
    .map((p) => {
      const href = `/m/${slug}/p/${encodeURIComponent(p.sku)}`;
      return (
        `<div class="card"><a href="${href}">${esc(p.title)}</a>` +
        `<div class="row"><span class="price">$${esc(p.price_usd)}</span><span class="stock">[ ${esc(p.availability)} ]</span></div>` +
        `<a class="btn" href="${href}">Buy with your AI agent</a></div>`
      );
    })
    .join('');
  const policyRows = kv(s.policy)
    .map(([k, v]) => {
      const m = POLICY_LABELS[k];
      return m
        ? `<tr><td class="k">${esc(m.label)}</td><td>${esc(m.value(v))}</td></tr>`
        : `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`;
    })
    .join('');
  const rep = kv(s.reputation);
  const reputation =
    '<h2>Reputation</h2>' +
    (rep.length
      ? `<div class="kv">${rep
          .map(
            ([k, v]) =>
              `<div><span class="k">${esc(k)}</span> <span class="dots">……</span> <strong>${esc(v)}</strong></div>`,
          )
          .join('')}` +
        `<div><span class="k">connection check</span> <span class="dots">……</span> <a href="/integrator/check/${slug}">/integrator/check/${slug}</a></div></div>`
      : `<p class="muted">No reputation data yet. Shown as data, never invented.</p>` +
        `<div class="kv"><div><span class="k">connection check</span> <span class="dots">……</span> <a href="/integrator/check/${slug}">/integrator/check/${slug}</a></div></div>`);
  const body =
    monitor +
    `<h1>${esc(s.name)}</h1><p class="sub">${esc(s.category)} · <a href="${esc(s.site_url)}" rel="nofollow noopener">${esc(s.site_url)}</a></p>` +
    (s.domain_verified
      ? '<p class="ok">[ OK ] domain_verified</p>'
      : '<p class="warn"><strong>[ WARN ]</strong> unverified_domain — the merchant has not yet proven control of this site.</p>') +
    `<h2>Buy with your AI agent</h2><p>Point your agent's MCP client at this shop's storefront. It sees only this shop's tools, gets a fixed-price quote and pays in USDC straight to the merchant.</p>` +
    codeBlock(mcpUrl(s.slug)) +
    `<p class="muted">Machine-readable: <a href="/m/${slug}/agent.json">agent.json</a> · <a href="/m/${slug}/llms.txt">llms.txt</a> · Agents also find this shop with apibase.discover (kind: merchant).</p>` +
    `<h2>Products</h2><div class="grid">${cards}</div>` +
    `<h2>Policy</h2><div class="table-wrap"><table>${policyRows}` +
    `<tr><td class="k">Payment</td><td>USDC on Base (x402) or Tempo (MPP), to the merchant's wallet</td></tr></table></div>` +
    reputation;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: s.name,
      url: shopUrl(s.slug),
      sameAs: [s.site_url],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: products.map((p) => offerLd(s.slug, p)),
    },
  ];
  return page(s.name, `/m/${s.slug}`, body, { ld });
}

// ---- /m/<slug>/p/<sku> ----
export function productMarkdown(s: PublicShop, p: PublicProductCard): string {
  return [
    `# ${p.title}`,
    '',
    `Sold by [${s.name}](${shopUrl(s.slug)}) — $${p.price_usd} USD, ${p.availability}`,
    '',
    p.description,
    '',
    `Buy with an AI agent: ${mcpUrl(s.slug)} (shop.quote.create, sku "${p.sku}")`,
    '',
  ].join('\n');
}

export function productHtml(s: PublicShop, p: PublicProductCard): string {
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      sku: p.sku,
      name: p.title,
      description: p.description,
      category: p.category ?? undefined,
      image: p.images.length ? p.images : undefined,
      offers: offerLd(s.slug, p),
    },
  ];
  const returns = p.refund_policy.returns_accepted
    ? `accepted${p.refund_policy.refund_window_days ? ` within ${p.refund_policy.refund_window_days} days` : ''}`
    : 'not accepted';
  const body =
    `<h1>${esc(p.title)}</h1><p class="sub">Sold by <a href="/m/${esc(s.slug)}">${esc(s.name)}</a></p>` +
    `<p><strong class="price">$${esc(p.price_usd)} USD</strong> · ${esc(p.availability)}${p.tax_included ? ' · tax included' : ''}</p>` +
    `<p>${esc(p.description)}</p><p>Returns: ${returns}</p>` +
    `<h2>Buy with your AI agent</h2>${codeBlock(mcpUrl(s.slug))}` +
    `<p class="muted">shop.quote.create · sku ${esc(p.sku)}</p>`;
  return page(p.title, `/m/${s.slug}/p/${encodeURIComponent(p.sku)}`, body, { noindex: true, ld });
}

// ---- /m/<slug>/cart ----
function cartText(s: PublicShop, lines: CartLine[], total: string): string {
  return `Your agent can create a quote: call shop.quote.create at ${mcpUrl(s.slug)} with items ${JSON.stringify(lines.map((l) => ({ sku: l.sku, qty: l.qty })))} (total $${total} USD at current prices)`;
}

export function cartMarkdown(s: PublicShop, lines: CartLine[], total: string): string {
  return [
    `# Cart — ${s.name}`,
    '',
    ...lines.map(
      (l) => `- ${l.qty} × ${l.title} (${l.sku}) @ $${l.unit_price_usd} = $${l.line_total_usd}`,
    ),
    '',
    `Total: $${total} USD`,
    '',
    cartText(s, lines, total),
    '',
  ].join('\n');
}

export function cartHtml(s: PublicShop, lines: CartLine[], total: string): string {
  const rows = lines
    .map(
      (l) =>
        `<tr><td>${esc(l.title)} <span class="muted">(${esc(l.sku)})</span></td><td>${l.qty}</td><td>$${esc(l.unit_price_usd)}</td><td>$${esc(l.line_total_usd)}</td></tr>`,
    )
    .join('');
  const body =
    `<h1>Cart — <a href="/m/${esc(s.slug)}">${esc(s.name)}</a></h1>` +
    `<div class="table-wrap"><table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Sum</th></tr>${rows}</table></div>` +
    `<p><strong>Total: $${esc(total)} USD</strong></p><p>${esc(cartText(s, lines, total))}</p>` +
    `<p class="muted">No payment is taken in the browser.</p>`;
  return page(`Cart — ${s.name}`, `/m/${s.slug}/cart`, body, { noindex: true });
}

// ---- machine-readable ----
export const agentJson = (s: PublicShop, sample: PublicProduct[]) => ({
  slug: s.slug,
  name: s.name,
  category: s.category,
  mcp_url: mcpUrl(s.slug),
  rest_base: REST_BASE,
  payment: { rails: ['x402', 'mpp'] },
  policy: s.policy,
  products_sample: sample.slice(0, 3),
});

export const llmsTxt = (s: PublicShop, sample: PublicProduct[]) =>
  [
    `# ${s.name}`,
    '',
    `> ${s.category} shop on APIbase.`,
    '',
    `AI agents can buy here: connect to ${mcpUrl(s.slug)} (MCP) and call shop.catalog.search / shop.quote.create.`,
    `Machine-readable: ${shopUrl(s.slug)}/agent.json`,
    '',
    ...sample.map((p) => `- ${p.title} (${p.sku}) — $${p.price_usd}`),
    '',
  ].join('\n');
