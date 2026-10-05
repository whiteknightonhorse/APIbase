import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ALLOWED_CATEGORIES } from '../moderation/categories';
import { mdToHtml, titleOf } from '../integrator/md';
import { renderTokens } from '../integrator/tokens';

export const INTEGRATOR_DIR = resolve(__dirname, '../../../static/integrator');
export const PLATFORMS = ['shopify', 'woocommerce', 'tilda', 'wix', 'custom'] as const;
const GUIDES = ['agent-guide', 'buyers', 'wallet', 'why-base-tempo'] as const;

export interface IntegratorRouterOptions {
  dir?: string;
  /** requests per minute per address (default 120): static content, no database. */
  limit?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STYLE =
  'body{background:#0b0e11;color:#d7dde4;font:15px/1.6 ui-monospace,Menlo,Consolas,monospace;margin:0}' +
  'main{max-width:820px;margin:0 auto;padding:24px 16px}a{color:#4cc2ff}h1,h2,h3{color:#fff}' +
  'pre{background:#1a2027;padding:8px;overflow-x:auto;user-select:all}code{background:#1a2027;padding:1px 4px}' +
  'li{margin:4px 0}';

const NAV =
  '<nav><a href="/">APIbase.pro</a> | <a href="/integrator">Integrator</a> | ' +
  '<a href="/integrator/agent-guide">Agent guide</a> | <a href="/integrator/buyers">Buyers</a></nav>';

function mdPage(md: string): string {
  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${esc(titleOf(md))} — APIbase</title><style>${STYLE}</style></head>` +
    `<body><main>${NAV}${mdToHtml(md)}</main></body></html>\n`
  );
}

/** F-18 / UC-20 / §13.1: the public integrator pages, HTML or Markdown from the same text. */
export function createIntegratorRouter(opts: IntegratorRouterOptions = {}): Router {
  const router = Router();
  const dir = opts.dir ?? INTEGRATOR_DIR;
  const cache = new Map<string, string>();
  const read = (name: string): string => {
    let s = cache.get(name);
    if (s === undefined) {
      s = readFileSync(resolve(dir, name), 'utf-8');
      cache.set(name, s);
    }
    return s;
  };
  const wantsMd = (req: Request) => /text\/markdown/i.test(req.get('accept') ?? '');

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: opts.limit ?? 120,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        error_code: 'rate_limited',
        message: 'too many requests from this address',
        suggested_action: 'retry_after_delay',
        documentation_url: '/docs/integrator',
      });
    },
  });

  const send = (req: Request, res: Response, name: string, render: (s: string) => string) => {
    res.set('Vary', 'Accept').set('Cache-Control', 'public, max-age=300');
    if (wantsMd(req)) {
      res.type('text/markdown; charset=utf-8').send(renderTokens(read(`${name}.md`)));
      return;
    }
    res
      .type('html')
      .send(render(renderTokens(read(name === 'index' ? 'index.html' : `${name}.md`))));
  };

  router.get('/integrator', limiter, (req, res) => send(req, res, 'index', (s) => s));
  router.get('/integrator/llms.txt', limiter, (_req, res) => {
    res.type('text/plain; charset=utf-8').send(renderTokens(read('llms.txt')));
  });
  router.get('/integrator/connect', limiter, (req, res) => {
    res.set('Vary', 'Accept').set('Cache-Control', 'public, max-age=300');
    if (wantsMd(req)) {
      res.type('text/markdown; charset=utf-8').send(read('connect.md'));
      return;
    }
    const options = ALLOWED_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
    res.type('html').send(read('connect.html').replace('{{CATEGORY_OPTIONS}}', () => options));
  });
  for (const g of GUIDES) {
    router.get(`/integrator/${g}`, limiter, (req, res) => send(req, res, g, mdPage));
  }
  router.get('/integrator/platforms/:name', limiter, (req, res) => {
    const name = String(req.params.name);
    if (!(PLATFORMS as readonly string[]).includes(name)) {
      res.status(404).json({
        error: 'not_found',
        error_code: 'not_found',
        message: 'unknown platform page',
        suggested_action: 'fix_request',
        documentation_url: '/integrator',
      });
      return;
    }
    send(req, res, `platforms/${name}`, mdPage);
  });

  return router;
}
