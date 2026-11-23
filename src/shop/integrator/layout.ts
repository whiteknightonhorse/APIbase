import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { breadcrumbLd, escAttr, fitTitle, metaTags, SITE_FOOTER, SITE_NAV } from '../page-meta';

export const INTEGRATOR_DIR = resolve(__dirname, '../../../static/integrator');

const DEFAULT_FOOTER = 'APIbase.pro · Integrator · x402 + MPP';
const SUB_NAV =
  '<nav class="nav-sub" aria-label="Integrator"><a href="/integrator">Integrator</a><a href="/integrator/agent-guide">Agent guide</a><a href="/integrator/buyers">Buyers</a><a href="/integrator/docs">Docs</a><a href="/shops">Shops</a></nav>\n';
const footerRow = (footer: string) =>
  `<div class="footer"><div class="footer-row"><span>${footer}</span><span><a href="/integrator/llms.txt">llms.txt</a> · Markdown: send Accept: text/markdown</span></div></div>\n`;
/** T-0943: the shared stylesheet of the site header; the partner view keeps the look without the menu. */
const SITE_CSS_LINK = /<link rel="stylesheet"[^>]*>/.exec(SITE_NAV)?.[0] ?? '';
/**
 * T-0943 (REQ-AB-R7-1 item 2): the partner view of a page: one bar with the word APIbase and one link
 * back to the partner (same tab); every other link of the page opens in a new tab (`<base target>`).
 */
const partnerBar = (p: { name: string; back: string }) =>
  `${SITE_CSS_LINK}\n<header class="site-header ho-bar"><div class="sh-in"><span class="brand">APIbase</span><a id="ho-back" href="${escAttr(p.back)}" target="_self">← Back to ${escAttr(p.name)}</a></div></header>`;
const PARTNER_HEAD =
  '<base target="_blank">\n<style>.ho-bar .sh-in{display:flex;justify-content:space-between;align-items:center;gap:16px}.ho-bar #ho-back{text-decoration:underline}</style>';
const cache = new Map<string, string>();

const read = (name: string): string => {
  let s = cache.get(name);
  if (s === undefined) {
    s = readFileSync(resolve(INTEGRATOR_DIR, name), 'utf-8');
    cache.set(name, s);
  }
  return s;
};

/** One shell for every integrator page: the homepage terminal theme plus a small page stylesheet. */
export function layout(o: {
  /** Raw (unescaped) page title; escaped and fitted to 20-65 characters here. */
  title: string;
  /** Raw meta description; fitted to 70-160 characters here. */
  description?: string;
  head?: string;
  path: string;
  body: string;
  footer?: string;
  /** Guide pages (T-0386): adds the design-M article styles (static/integrator/_docs.css). */
  docs?: boolean;
  /** T-0391: design-M scope class for pages built on the `.ig` rules of site-m.css. */
  scope?: string;
  /** T-0943: the page was opened from a registry partner: no site menu, tabs or footers; one link back. */
  partner?: { name: string; back: string };
}): string {
  const css = [read('_theme.css'), read('_page.css'), ...(o.docs ? [read('_docs.css')] : [])]
    .map((c) => c.trim())
    .join('\n');
  const title = fitTitle(o.title);
  const crumbs: Array<[string, string]> = [
    ['Home', '/'],
    ['Integrator', '/integrator'],
  ];
  if (o.path.startsWith('/integrator/')) crumbs.push([title, o.path]);
  const ld = o.path.startsWith('/integrator') ? breadcrumbLd(crumbs) : '';
  const values: Record<string, string> = {
    TITLE: escAttr(title),
    HEAD:
      metaTags({ title, description: o.description, path: o.path }) +
      ld +
      (o.head ?? '') +
      (o.partner ? PARTNER_HEAD : ''),
    SITE_FOOTER: o.partner ? '' : SITE_FOOTER,
    SITE_NAV: o.partner ? partnerBar(o.partner) : SITE_NAV,
    SUB_NAV: o.partner ? '' : SUB_NAV,
    FOOTER_ROW: o.partner ? '' : footerRow(o.footer ?? DEFAULT_FOOTER),
    CSS: css,
    PATH: o.path,
    BODY: o.body,
    SHELL: o.docs ? ' dx-shell' : o.scope ? ` ${o.scope}` : '',
  };
  return read('_layout.html').replace(
    /\{\{(TITLE|HEAD|CSS|PATH|BODY|SHELL|SITE_FOOTER|SITE_NAV|SUB_NAV|FOOTER_ROW)\}\}/g,
    (_m, k: string) => values[k],
  );
}
