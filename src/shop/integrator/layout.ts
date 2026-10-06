import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  title: string;
  head?: string;
  path: string;
  body: string;
  footer?: string;
}): string {
  const css = `${read('_theme.css').trim()}\n${read('_page.css').trim()}`;
  const values: Record<string, string> = {
    TITLE: o.title,
    HEAD: o.head ?? '',
    CSS: css,
    PATH: o.path,
    BODY: o.body,
    FOOTER: o.footer ?? DEFAULT_FOOTER,
  };
  return read('_layout.html').replace(
    /\{\{(TITLE|HEAD|CSS|PATH|BODY|FOOTER)\}\}/g,
    (_m, k: string) => values[k],
  );
}
