import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  breadcrumbLd,
  escAttr,
  fitTitle,
  metaTags,
  GA4,
  SITE_FOOTER,
  SITE_NAV,
} from '../page-meta';

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
}): string {
  const css = `${read('_theme.css').trim()}\n${read('_page.css').trim()}`;
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
    GA4,
    CSS: css,
    PATH: o.path,
    BODY: o.body,
    FOOTER: o.footer ?? DEFAULT_FOOTER,
  };
  return read('_layout.html').replace(
    /\{\{(TITLE|HEAD|CSS|PATH|BODY|FOOTER|SITE_FOOTER|SITE_NAV|GA4)\}\}/g,
    (_m, k: string) => values[k],
  );
}
