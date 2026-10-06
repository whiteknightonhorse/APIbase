import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ALLOWED_CATEGORIES } from '../moderation/categories';
import { mdToHtml, titleOf } from '../integrator/md';
import { renderTokens } from '../integrator/tokens';
import { INTEGRATOR_DIR, layout } from '../integrator/layout';

export { INTEGRATOR_DIR };
export const PLATFORMS = ['shopify', 'woocommerce', 'tilda', 'wix', 'custom'] as const;
const GUIDES = ['agent-guide', 'buyers', 'wallet', 'why-base-tempo'] as const;

export interface IntegratorRouterOptions {
  dir?: string;
  /** requests per minute per address (default 120): static content, no database. */
  limit?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INDEX_HEAD =
  '<meta name="description" content="Sell to AI agents: one link on your site, USDC settles to your wallet.">';
const CONNECT_HEAD = '<meta name="robots" content="noindex, follow">';

const mdPage = (md: string, path: string): string =>
  layout({ title: `${esc(titleOf(md))} — APIbase`, path, body: mdToHtml(md) });

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

  const send = (
    req: Request,
    res: Response,
    name: string,
    render: (s: string, path: string) => string,
  ) => {
    res.set('Vary', 'Accept').set('Cache-Control', 'public, max-age=300');
    if (wantsMd(req)) {
      res.type('text/markdown; charset=utf-8').send(renderTokens(read(`${name}.md`)));
      return;
    }
    res
      .type('html')
      .send(
        render(
          renderTokens(read(name === 'index' ? 'index.html' : `${name}.md`)),
          name === 'index' ? '/integrator' : `/integrator/${name}`,
        ),
      );
  };

  router.get('/integrator', limiter, (req, res) =>
    send(req, res, 'index', (body, path) =>
      layout({
        title: 'Integrator — AI payment for your shop | APIbase',
        head: INDEX_HEAD,
        path,
        body,
      }),
    ),
  );
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
    const body = read('connect.html').replace('{{CATEGORY_OPTIONS}}', () => options);
    res.type('html').send(
      layout({
        title: 'Connect AI payment | APIbase Integrator',
        head: CONNECT_HEAD,
        path: '/integrator/connect',
        body,
      }),
    );
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
