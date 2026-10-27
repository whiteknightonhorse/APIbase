import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { breadcrumbLd, escAttr, fitTitle, metaTags, SITE_FOOTER, SITE_NAV } from '../page-meta';

export const INTEGRATOR_DIR = resolve(__dirname, '../../../static/integrator');

const DEFAULT_FOOTER = 'APIbase.pro · Integrator · x402 + MPP';
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
    HEAD: metaTags({ title, description: o.description, path: o.path }) + ld + (o.head ?? ''),
    SITE_FOOTER,
    SITE_NAV,
    CSS: css,
    PATH: o.path,
    BODY: o.body,
    FOOTER: o.footer ?? DEFAULT_FOOTER,
    SHELL: o.docs ? ' dx-shell' : o.scope ? ` ${o.scope}` : '',
  };
  return read('_layout.html').replace(
    /\{\{(TITLE|HEAD|CSS|PATH|BODY|FOOTER|SHELL|SITE_FOOTER|SITE_NAV)\}\}/g,
    (_m, k: string) => values[k],
  );
}
