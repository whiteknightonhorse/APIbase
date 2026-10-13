import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SITE_ORIGIN = 'https://apibase.pro';
export const OG_IMAGE = `${SITE_ORIGIN}/og-image.png?v=20260928`;

export const TITLE_MIN = 20;
export const TITLE_MAX = 65;
export const DESC_MIN = 70;
export const DESC_MAX = 160;

/** The one footer fragment every HTML page carries (T-0344); static pages hold the same bytes. */
export const SITE_FOOTER = readFileSync(
  resolve(__dirname, '../../config/page-footer.html'),
  'utf-8',
).trim();

/** The one site header (T-0367/T-0368); static pages hold the same bytes between the same markers. */
export const SITE_NAV =
  '<!--site-nav-->\n' +
  readFileSync(resolve(__dirname, '../../config/site-nav.html'), 'utf-8').trim() +
  '\n<!--/site-nav-->';
export const SITE_NAV_CSS =
  '/*site-nav*/\n' +
  readFileSync(resolve(__dirname, '../../config/site-nav.css'), 'utf-8').trim() +
  '\n/*/site-nav*/';

/** GA4 snippet for human-facing HTML pages only (T-0375); static pages hold the same bytes between the same markers. */
export const GA4 =
  '<!--ga4-->\n' +
  readFileSync(resolve(__dirname, '../../config/ga4.html'), 'utf-8').trim() +
  '\n<!--/ga4-->';

const DEFAULT_DESCRIPTION =
  'Sell to AI agents: a buyer agent orders and pays in USDC over x402 or MPP, straight to the merchant wallet.';

export const escAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cut = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const sp = head.lastIndexOf(' ');
  return `${(sp > max / 2 ? head.slice(0, sp) : head).trimEnd()}…`;
};

/** Raw title forced into the 20-65 character window. */
export function fitTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < TITLE_MIN) t = `${t} | APIbase AI payment`;
  return cut(t, TITLE_MAX);
}

/** Raw text forced into the 70-160 character window (short text gets the default sentence appended). */
export function fitDescription(raw: string | undefined): string {
  let d = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (d.length < DESC_MIN) d = `${d} ${DEFAULT_DESCRIPTION}`.trim();
  return cut(d, DESC_MAX);
}

/** description + canonical + Open Graph + Twitter card tags for one page. `path` starts with `/`. */
export function metaTags(o: { title: string; description?: string; path: string }): string {
  const title = escAttr(fitTitle(o.title));
  const description = escAttr(fitDescription(o.description));
  const url = escAttr(`${SITE_ORIGIN}${o.path}`);
  return (
    `<meta name="description" content="${description}">` +
    `<link rel="canonical" href="${url}">` +
    `<meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="${description}">` +
    `<meta property="og:url" content="${url}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:image" content="${OG_IMAGE}">` +
    `<meta name="twitter:card" content="summary_large_image">`
  );
}

/** schema.org BreadcrumbList as an inline JSON-LD script (`<` can never close the tag). */
export function breadcrumbLd(items: Array<[name: string, path: string]>): string {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: `${SITE_ORIGIN}${path}`,
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}
