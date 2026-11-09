import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ALLOWED_CATEGORIES } from '../moderation/categories';
import { docToHtml, leadOf, titleOf } from '../integrator/md';
import { renderTokens } from '../integrator/tokens';
import { INTEGRATOR_DIR, layout } from '../integrator/layout';
import { logger } from '../../config/logger';
import type { ShopTx } from '../db';
import { openHandoff } from '../partner/handoff.service';
import {
  X_APIBASE_DELIVERY_ID,
  X_APIBASE_EVENT,
  X_APIBASE_SIGNATURE,
} from '../../config/http-headers';

export { INTEGRATOR_DIR };
export const PLATFORMS = ['shopify', 'woocommerce', 'tilda', 'wix', 'custom'] as const;
const GUIDES = ['agent-guide', 'buyers', 'wallet', 'why-base-tempo'] as const;

export interface IntegratorRouterOptions {
  dir?: string;
  /** requests per minute per address (default 120): static content, no database. */
  limit?: number;
  /** T-0739: handoff store for `/integrator/connect?from=<partner>&handoff=<id>` (default: the app database, lazily). */
  db?: ShopTx;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Partner {
  id: string;
  name: string;
  site: string;
  return_url: string;
  /** T-0739: sha256 (hex) of the partner's `pk_live_` key; the key itself is never in git. */
  key_sha256: string;
}

/** T-0728: partner registry for the connect page "Continue on <partner>" button; invalid file = startup error. */
export function loadPartners(file: string): Partner[] {
  const v: unknown = JSON.parse(readFileSync(file, 'utf-8'));
  if (!Array.isArray(v)) throw new Error('partners.json: expected an array');
  const seen = new Set<string>();
  return v.map((raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    for (const k of ['id', 'name', 'site', 'return_url', 'key_sha256'])
      if (typeof r[k] !== 'string' || !r[k]) throw new Error(`partners.json: bad field ${k}`);
    const p = r as unknown as Partner;
    if (!/^[a-z0-9-]{2,40}$/.test(p.id) || seen.has(p.id))
      throw new Error('partners.json: bad or duplicate id');
    seen.add(p.id);
    if (!/^[0-9a-f]{64}$/.test(p.key_sha256)) throw new Error('partners.json: bad key_sha256');
    for (const u of [p.site, p.return_url])
      if (new URL(u).protocol !== 'https:') throw new Error('partners.json: https required');
    return p;
  });
}

const PARTNERS = loadPartners(resolve(__dirname, '../../../config/integrator/partners.json'));
/** T-0739: the same registry, for the partner key guard. */
export const partners = (): readonly Partner[] => PARTNERS;

const INDEX_DESCRIPTION =
  "Agentic commerce for merchants: one link on your site, a buyer's AI agent places and pays the order, USDC settles to your wallet. Agentic checkout, any store.";
const CONNECT_HEAD = '<meta name="robots" content="noindex, follow">';

/** Lazy database handle: the page routes import no database code until a handoff link is opened. */
const lazyDb = (): ShopTx => {
  const prisma = async () => (await import('../../services/prisma.service')).getPrisma();
  return {
    $queryRawUnsafe: async (q, ...v) => (await prisma()).$queryRawUnsafe(q, ...v),
    $executeRawUnsafe: async (q, ...v) => (await prisma()).$executeRawUnsafe(q, ...v),
  };
};

/** JSON inside <script type="application/json">: `<`, `>` and `&` written as \u escapes. */
const scriptJson = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const mdPage = (md: string, path: string): string =>
  layout({
    title: `${titleOf(md)} — APIbase`,
    description: leadOf(md),
    path,
    body: docToHtml(md),
    docs: true,
  });

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
  let db = opts.db;
  const handoffDb = (): ShopTx => (db ??= lazyDb());
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
        documentation_url: '/integrator/docs',
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
        title: 'Agentic commerce for your shop — AI payment | APIbase',
        description: INDEX_DESCRIPTION,
        path,
        body,
        scope: 'ig',
      }),
    ),
  );
  router.get('/integrator/llms.txt', limiter, (_req, res) => {
    res.type('text/plain; charset=utf-8').send(renderTokens(read('llms.txt')));
  });
  router.get('/integrator/connect', limiter, async (req, res) => {
    res.set('Vary', 'Accept').set('Cache-Control', 'public, max-age=300');
    if (wantsMd(req)) {
      res.type('text/markdown; charset=utf-8').send(read('connect.md'));
      return;
    }
    const options = ALLOWED_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
    const from: unknown = req.query.from;
    const partner = typeof from === 'string' ? PARTNERS.find((p) => p.id === from) : undefined;
    let partnerHtml = partner
      ? `<input type="hidden" name="partner" value="${esc(partner.id)}" form="f"><a id="pt" class="lp-cta" data-return="${esc(partner.return_url)}" hidden>Continue on ${esc(partner.name)}</a>`
      : '';
    // T-0739: a handoff link of a known partner. Live -> prefill; anything else -> one hint line, no echo.
    let hint = '';
    const handoff: unknown = req.query.handoff;
    if (partner && handoff !== undefined) {
      res.set('Cache-Control', 'private, no-store');
      let live: Awaited<ReturnType<typeof openHandoff>> = null;
      try {
        live = await openHandoff(handoffDb(), partner.id, handoff);
      } catch (err) {
        logger.warn({ err, partner: partner.id }, 'handoff open failed');
      }
      if (live) {
        hint = `<p class="hint">Prefilled from ${esc(partner.name)}. Check the values and continue.</p>`;
        partnerHtml += `<input type="hidden" name="handoff" value="${esc(live.handoff_id)}" data-partner="${esc(partner.name)}" form="f"><script type="application/json" id="pf">${scriptJson({ prefill: live.prefill, expected_wallet: live.expected_wallet })}</script>`;
      } else {
        hint = `<p class="hint">This link from ${esc(partner.name)} is no longer valid. You can still connect your store and return there.</p>`;
      }
    }
    const body = renderTokens(read('connect.html'))
      .replace('{{CATEGORY_OPTIONS}}', () => options)
      .replace('{{HANDOFF_HINT}}', () => hint)
      .replace('{{PARTNER}}', () => partnerHtml);
    res.type('html').send(
      layout({
        title: 'Connect AI payment | APIbase Integrator',
        description:
          'Connect your shop to APIbase: register the storefront and let buyer AI agents order and pay in USDC.',
        head: CONNECT_HEAD,
        path: '/integrator/connect',
        body,
        scope: 'ig',
      }),
    );
  });
  router.get('/integrator/docs', limiter, (req, res) =>
    send(req, res, 'docs', (md, path) =>
      layout({
        title: 'Integrator guide | APIbase',
        description: leadOf(md),
        path,
        body: docToHtml(md),
        docs: true,
      }),
    ),
  );
  for (const g of GUIDES) {
    router.get(`/integrator/${g}`, limiter, (req, res) => send(req, res, g, mdPage));
  }
  // T-0535: explicit `.md` path twins, byte-identical to the `Accept: text/markdown` answer.
  const sendMdTwin = (res: Response, file: string, htmlPath: string, tokens = true) => {
    const md = read(file);
    res
      .set('Cache-Control', 'public, max-age=300')
      .set('Link', `<https://apibase.pro${htmlPath}>; rel="canonical"`)
      .type('text/markdown; charset=utf-8')
      .send(tokens ? renderTokens(md) : md);
  };
  router.get(['/integrator.md', '/integrator/index.md'], limiter, (_req, res) =>
    sendMdTwin(res, 'index.md', '/integrator'),
  );
  for (const n of ['docs', 'connect', ...GUIDES]) {
    router.get(`/integrator/${n}.md`, limiter, (_req, res) =>
      sendMdTwin(res, `${n}.md`, `/integrator/${n}`, n !== 'connect'),
    );
  }
  router.get('/integrator/platforms/:name', limiter, (req, res) => {
    const isMd = String(req.params.name).endsWith('.md');
    const name = String(req.params.name).replace(/\.md$/, '');
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
    if (isMd) {
      sendMdTwin(res, `platforms/${name}.md`, `/integrator/platforms/${name}`);
      return;
    }
    send(req, res, `platforms/${name}`, mdPage);
  });

  // T-INT-52: demo webhook receiver. Stateless, no secrets: logs one line per event, never verifies.
  const sinkLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limited',
        error_code: 'rate_limited',
        message: 'too many requests from this address',
        suggested_action: 'retry_after_delay',
        documentation_url: '/integrator/docs',
      });
    },
  });
  router.post(
    '/integrator/demo-webhook',
    sinkLimiter,
    express.raw({ type: () => true, limit: 16 * 1024 }),
    (req: Request, res: Response) => {
      const event = req.get(X_APIBASE_EVENT);
      if (!event) {
        res.status(204).end();
        return;
      }
      logger.info(
        {
          delivery_id: req.get(X_APIBASE_DELIVERY_ID) ?? null,
          event,
          signature: req.get(X_APIBASE_SIGNATURE) ?? null,
          body: Buffer.isBuffer(req.body) ? req.body.toString('utf-8') : '',
        },
        'demo webhook received',
      );
      res.status(200).json({ ok: true });
    },
    (err: { status?: number }, _req: Request, res: Response, next: NextFunction) => {
      if (err.status === 413) {
        res.status(413).json({
          error: 'payload_too_large',
          error_code: 'payload_too_large',
          message: 'body must be at most 16 KB',
          suggested_action: 'fix_request',
          documentation_url: '/integrator',
        });
        return;
      }
      next(err);
    },
  );

  return router;
}
