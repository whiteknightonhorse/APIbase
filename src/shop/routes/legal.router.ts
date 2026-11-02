import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getShopEnv } from '../../config/env';
import {
  fitDescription,
  fitTitle,
  metaTags,
  SITE_FOOTER,
  SITE_NAV,
  SITE_NAV_CSS,
} from '../page-meta';
import { autolinkSitePaths } from '../integrator/md';
import { legalDocumentHtml } from '../legal/legal-layout';
import { defaultShopDeps } from '../merchant-lifecycle.service';
import type { ShopTx } from '../db';
import {
  isLegalDocId,
  LEGAL_DIR,
  LEGAL_PUBLISHED_FILE,
  isLegalPublished,
  legalIndex,
  legalSource,
  nextLegalRows,
} from '../legal/legal-docs';

export const DRAFT_BANNER =
  '<div class="draft-banner">DRAFT — not yet published; do not rely on this text</div>';

const STATIC_DIR = resolve(LEGAL_DIR, '..');
const PROHIBITED_FILE = resolve(LEGAL_DIR, '../../config/integrator/prohibited-categories.json');
const REGISTER_FILE = resolve(LEGAL_DIR, '../../config/site-docs-register.json');

export interface LegalRouterOptions {
  db?: ShopTx;
  /** Directory holding terms.html / privacy.html (default: the repo `static/`). */
  staticDir?: string;
  dir?: string;
  publishedFile?: string;
  now?: () => number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Fee text for the `{{INTEGRATOR_FEE_PCT}}` token: 0% in the pilot (switch off), else from BPS. */
function feeText(): string {
  const e = getShopEnv();
  const bps = e.INTEGRATOR_FEE_BPS;
  if (e.INTEGRATOR_FEE_ENABLED === 'true' && bps > 0) {
    return `${bps / 100}%`;
  }
  return '0% during the pilot';
}

const inline = (s: string) =>
  autolinkSitePaths(
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'),
  );

/** Drop every terminated `<!-- ... -->` block. Scans with indexOf and restarts after each removal,
 *  so a removal can never leave a new terminated comment behind; an unterminated opener is kept
 *  and HTML-escaped downstream (CodeQL js/incomplete-multi-character-sanitization). */
export function stripHtmlComments(md: string): string {
  for (;;) {
    const start = md.indexOf('<!--');
    if (start === -1) return md;
    const end = md.indexOf('-->', start + 4);
    if (end === -1) return md;
    md = md.slice(0, start) + md.slice(end + 3);
  }
}

/** Minimal Markdown → HTML for the fixed legal files (headings, lists, quotes, rules, paragraphs). */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of stripHtmlComments(md).split(/\r?\n/)) {
    const h = /^(#{1,3}) (.+)$/.exec(line);
    const li = /^(?:- |(\d+)\. )(.+)$/.exec(line);
    if (h || li || !line.trim() || line === '---' || line.startsWith('> ')) {
      flushPara();
      if (!li) closeList();
    }
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (li) {
      const kind = li[1] ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(li[2])}</li>`);
    } else if (line === '---') out.push('<hr>');
    else if (line.startsWith('> ')) out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
    else if (line.trim()) para.push(line.trim());
  }
  flushPara();
  closeList();
  return out.join('\n');
}

const DOC_TITLES: Record<string, string> = {
  'merchant-agreement': 'Merchant Agreement',
  aup: 'Acceptable Use Policy',
  dpa: 'Data Processing Addendum',
  'refund-framework': 'Refund Framework',
};

/** First paragraph of the rendered body as plain text, for the meta description. */
export function firstParagraph(bodyHtml: string): string {
  const start = bodyHtml.indexOf('<p>');
  const end = start === -1 ? -1 : bodyHtml.indexOf('</p>', start);
  if (end === -1) return '';
  let text = bodyHtml.slice(start + 3, end);
  for (;;) {
    const open = text.indexOf('<');
    const close = open === -1 ? -1 : text.indexOf('>', open);
    if (close === -1) break;
    text = text.slice(0, open) + text.slice(close + 1);
  }
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .slice(0, 300);
}

const STYLE = 'pre{overflow-x:auto}.table-wrap,.m-table-wrap{overflow-x:auto}';
const DRAFT_STYLE =
  '.draft-banner{background:#7a1f1f;color:#eef1ed;padding:12px 16px;font-weight:bold;text-align:center}';

function page(
  docId: string,
  body: string,
  draft: boolean,
  meta: { version: string; effective: string },
): string {
  const docTitle = DOC_TITLES[docId] ?? docId;
  const title = fitTitle(`${docTitle} — APIbase legal`);
  const desc = fitDescription(firstParagraph(body));
  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    metaTags({ title, description: desc, path: `/legal/${docId}` }) +
    (draft ? '<meta name="robots" content="noindex">' : '') +
    `<title>${esc(title)}</title><style>${STYLE}${draft ? DRAFT_STYLE : ''}\n${SITE_NAV_CSS}</style></head><body>` +
    (draft ? DRAFT_BANNER : '') +
    SITE_NAV +
    legalDocumentHtml(docTitle, body, meta) +
    SITE_FOOTER +
    '</body></html>\n'
  );
}

/**
 * The legal text of a static page: the `lg-doc` body, without the header bar, the counts ticker
 * (`lg-facts`) and the footer. The hourly counts cron rewrites those, and the in-text
 * "N tools from N providers" figure, so none of them may move the published hash.
 */
export function legalBodyOf(html: string): string {
  const start = html.indexOf('<div class="lg-doc">');
  if (start < 0) throw new Error('static legal page has no lg-doc body');
  const ends = [html.indexOf('<p class="lg-facts">', start), html.indexOf('<footer', start)].filter(
    (i) => i >= 0,
  );
  const end = ends.length > 0 ? Math.min(...ends) : html.length;
  return html
    .slice(start, end)
    .replace(/\d+ tools from \d+ providers/g, 'N tools from N providers');
}

/** `version` and `effective_from` of a static page from config/site-docs-register.json, if listed. */
function registerEntry(
  id: string,
  registerFile: string,
): { version?: string; effective_from?: string } {
  try {
    const j = JSON.parse(readFileSync(registerFile, 'utf-8')) as Record<string, unknown>;
    const e = j[id] as { version?: unknown; effective_from?: unknown } | undefined;
    return {
      ...(typeof e?.version === 'string' ? { version: e.version } : {}),
      ...(typeof e?.effective_from === 'string' ? { effective_from: e.effective_from } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Pointers to the static Terms/Privacy pages: sha256 of the legal body only, not registry documents.
 * `scheduled: false` -> the pages as served now (a version whose effective_from is still in the
 * future is not marked current: no version/effective_from); `scheduled: true` -> only the pages
 * with a future effective_from, carrying that version.
 */
export function staticPageEntries(
  staticDir: string,
  registerFile: string = REGISTER_FILE,
  opts: { now?: number; scheduled?: boolean } = {},
): Array<Record<string, unknown>> {
  const now = opts.now ?? Date.now();
  return ['terms', 'privacy'].flatMap((id) => {
    const file = resolve(staticDir, `${id}.html`);
    if (!existsSync(file)) throw new Error(`static page missing from image: ${file}`);
    const reg = registerEntry(id, registerFile);
    const future = reg.effective_from !== undefined && Date.parse(reg.effective_from) > now;
    if (opts.scheduled === true && !future) return [];
    const meta = future && opts.scheduled !== true ? {} : reg;
    return [
      {
        doc_id: id,
        ...meta,
        url: `/${id}`,
        sha256: createHash('sha256')
          .update(legalBodyOf(readFileSync(file, 'utf-8')))
          .digest('hex'),
        registry: false,
        hash_of: 'legal-body',
        source_url: `/legal/${id}.body.txt`,
      },
    ];
  });
}

/** Browser view of the /legal index: same chrome as the /legal/<doc> pages, one row per document. */
export function indexPage(docs: ReadonlyArray<object>): string {
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const rows = (docs as Array<Record<string, unknown>>)
    .map((d) => {
      const id = esc(str(d.doc_id));
      const url = esc(str(d.url));
      const title = esc(DOC_TITLES[str(d.doc_id)] ?? str(d.doc_id));
      const md = d.registry === false ? '' : ` · <a href="${url}.md">.md</a>`;
      return (
        `<tr><td><a href="${url}">${title}</a>${md}<br><code>${id}</code></td>` +
        `<td>${esc(str(d.version)) || '—'}</td>` +
        `<td>${esc(str(d.effective_from).slice(0, 10)) || '—'}</td>` +
        `<td><code>${esc(str(d.sha256))}</code></td></tr>`
      );
    })
    .join('');
  const title = fitTitle('Legal documents — APIbase legal');
  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    metaTags({
      title,
      description:
        'Every APIbase legal document with its current version, effective date and SHA-256, as HTML and Markdown.',
      path: '/legal',
    }) +
    `<title>${esc(title)}</title><style>${STYLE}\n${SITE_NAV_CSS}</style></head><body>` +
    SITE_NAV +
    '<div class="page-shell"><main class="container lg" id="main-content">' +
    '<div class="lg-crumb"><ol class="m-breadcrumb"><li><a href="/">Home</a></li><li aria-current="page">Legal</li></ol></div>' +
    '<h1>Legal documents</h1>' +
    '<p>Current version of each document. The same list as JSON: <a href="/legal/index.json">/legal/index.json</a>.</p>' +
    `<div class="table-wrap"><table><thead><tr><th>Document</th><th>Version</th><th>Effective</th><th>SHA-256</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    '<p class="attribution"><a href="https://db-ip.com">IP geolocation by DB-IP</a> (IP to Country Lite, CC BY 4.0).</p>' +
    '</main></div>' +
    SITE_FOOTER +
    '</body></html>\n'
  );
}

/** §11 / §15 public legal documents: /legal, /legal/index.json, /legal/:doc_id[.md]. */
export function createLegalRouter(opts: LegalRouterOptions = {}): Router {
  const publishedFile = opts.publishedFile ?? LEGAL_PUBLISHED_FILE;
  const now = opts.now ?? Date.now;
  const staticDir = opts.staticDir ?? STATIC_DIR;
  const db = () => opts.db ?? defaultShopDeps().db;
  const router = Router();

  router.use(
    '/legal',
    rateLimit({
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
          documentation_url: '/integrator/docs#legal-documents',
        });
      },
    }),
  );

  const isPublished = (): boolean => isLegalPublished(publishedFile).published;

  const sendIndex = async (req: Request, res: Response, html = false) => {
    try {
      const docs = [
        ...(await legalIndex(db(), now())),
        ...staticPageEntries(staticDir, REGISTER_FILE, { now: now() }),
      ];
      res
        .set('Cache-Control', 'no-cache')
        .set('Vary', 'Accept')
        .set('Link', '</legal/index.next.json>; rel="next"');
      if (html && req.accepts(['json', 'html']) === 'html') res.type('html').send(indexPage(docs));
      else res.json(docs);
    } catch {
      res.status(503).json({
        error: 'unavailable',
        error_code: 'legal_index_unavailable',
        message: 'legal index temporarily unavailable',
        suggested_action: 'retry_after_delay',
        documentation_url: '/integrator/docs#legal-documents',
      });
    }
  };

  router.get('/legal', (req, res) => sendIndex(req, res, true));
  router.get('/legal/index.json', (req, res) => sendIndex(req, res));

  const limiterOf = () =>
    rateLimit({
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
          documentation_url: '/integrator/docs#legal-documents',
        });
      },
    });
  const nextLimiter = limiterOf();
  const srcLimiter = limiterOf();
  const bodyLimiter = limiterOf();
  const docLimiter = limiterOf();

  router.get('/legal/index.next.json', nextLimiter, async (_req, res) => {
    try {
      res
        .set('Cache-Control', 'no-cache')
        .json([
          ...(await nextLegalRows(db(), undefined, now())),
          ...staticPageEntries(staticDir, REGISTER_FILE, { now: now(), scheduled: true }),
        ]);
    } catch {
      res.status(503).json({
        error: 'unavailable',
        error_code: 'legal_index_unavailable',
        message: 'legal index temporarily unavailable',
        suggested_action: 'retry_after_delay',
        documentation_url: '/integrator/docs#legal-documents',
      });
    }
  });

  const notFound = (res: Response, error_code: string, message: string) =>
    res.status(404).json({
      error: 'not_found',
      error_code,
      message,
      suggested_action: 'fix_request',
      documentation_url: '/legal/index.json',
    });

  // The exact registry bytes that /legal/index.json hashes: no substitution of any token.
  router.get(/^\/legal\/([a-z-]+)\.src\.md$/, srcLimiter, async (req, res) => {
    const id = String(req.params[0]);
    const v: unknown = req.query.version;
    if (!isLegalDocId(id)) return void notFound(res, 'not_found', 'unknown legal document');
    if (v !== undefined && (typeof v !== 'string' || !/^[0-9][0-9A-Za-z.]*$/.test(v))) {
      return void notFound(res, 'unknown_version', 'unknown version of this document');
    }
    try {
      const row = await legalSource(db(), id, v, now());
      if (!row) {
        return void notFound(
          res,
          v === undefined ? 'not_found' : 'unknown_version',
          'no such version of this document',
        );
      }
      res
        .set('ETag', `"sha256-${row.sha256}"`)
        .set(
          'Cache-Control',
          v === undefined ? 'public, max-age=300' : 'public, max-age=31536000, immutable',
        )
        .type('text/markdown; charset=utf-8')
        .send(Buffer.from(row.body_md, 'utf-8'));
    } catch {
      res.status(503).json({
        error: 'unavailable',
        error_code: 'legal_index_unavailable',
        message: 'legal document temporarily unavailable',
        suggested_action: 'retry_after_delay',
        documentation_url: '/integrator/docs#legal-documents',
      });
    }
  });

  // The exact text staticPageEntries hashes for /terms and /privacy.
  router.get(/^\/legal\/(terms|privacy)\.body\.txt$/, bodyLimiter, (req, res) => {
    const page = String(req.params[0]);
    const file = resolve(staticDir, `${page}.html`);
    if (!existsSync(file)) return void notFound(res, 'not_found', 'static page missing');
    res
      .set('Cache-Control', 'public, max-age=300')
      .type('text/plain; charset=utf-8')
      .send(legalBodyOf(readFileSync(file, 'utf-8')));
  });

  const prohibitedLimiter = rateLimit({
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
        documentation_url: '/integrator/docs#legal-documents',
      });
    },
  });

  router.get('/legal/prohibited-categories.json', prohibitedLimiter, (_req, res) => {
    res
      .set('Cache-Control', 'public, max-age=3600')
      .type('application/json')
      .send(readFileSync(PROHIBITED_FILE));
  });

  router.get('/legal/:doc', docLimiter, async (req: Request, res: Response) => {
    const raw = String(req.params.doc);
    const wantsMd = raw.endsWith('.md');
    const id = wantsMd ? raw.slice(0, -3) : raw;
    if (!isLegalDocId(id)) {
      res.status(404).json({
        error: 'not_found',
        error_code: 'not_found',
        message: 'unknown legal document',
        suggested_action: 'fix_request',
        documentation_url: '/legal/index.json',
      });
      return;
    }
    let file: { version: string; effective_from: string; body_md: string } | null;
    try {
      file = await legalSource(db(), id, undefined, now());
    } catch {
      file = null;
    }
    if (!file) {
      res.status(503).json({
        error: 'unavailable',
        error_code: 'legal_index_unavailable',
        message: 'legal document temporarily unavailable',
        suggested_action: 'retry_after_delay',
        documentation_url: '/integrator/docs#legal-documents',
      });
      return;
    }
    res.set('Vary', 'Accept');
    if (wantsMd || /text\/markdown/i.test(req.get('accept') ?? '')) {
      res
        .type('text/markdown; charset=utf-8')
        .send(file.body_md.replace(/\{\{INTEGRATOR_FEE_PCT\}\}/g, feeText()));
      return;
    }
    const body = renderMarkdown(file.body_md).replace(
      /\{\{INTEGRATOR_FEE_PCT\}\}/g,
      esc(feeText()),
    );
    res.type('html').send(
      page(id, body, !isPublished(), {
        version: file.version,
        effective: file.effective_from.slice(0, 10),
      }),
    );
  });

  return router;
}
