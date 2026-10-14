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
  readLegalFile,
} from '../legal/legal-docs';

export const DRAFT_BANNER =
  '<div class="draft-banner">DRAFT — not yet published; do not rely on this text</div>';

const STATIC_DIR = resolve(LEGAL_DIR, '..');
const PROHIBITED_FILE = resolve(LEGAL_DIR, '../../config/integrator/prohibited-categories.json');

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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
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

/** Pointers to the static Terms/Privacy pages: sha256 of the HTML bytes, not registry documents. */
export function staticPageEntries(staticDir: string): Array<Record<string, unknown>> {
  return ['terms', 'privacy'].flatMap((id) => {
    const file = resolve(staticDir, `${id}.html`);
    if (!existsSync(file)) throw new Error(`static page missing from image: ${file}`);
    return [
      {
        doc_id: id,
        url: `/${id}`,
        sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
        registry: false,
      },
    ];
  });
}

/** §11 / §15 public legal documents: /legal, /legal/index.json, /legal/:doc_id[.md]. */
export function createLegalRouter(opts: LegalRouterOptions = {}): Router {
  const dir = opts.dir ?? LEGAL_DIR;
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

  const sendIndex = async (res: Response) => {
    try {
      const docs = await legalIndex(db(), now());
      res.set('Cache-Control', 'no-cache').json([...docs, ...staticPageEntries(staticDir)]);
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

  router.get('/legal', (_req, res) => sendIndex(res));
  router.get('/legal/index.json', (_req, res) => sendIndex(res));

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

  router.get('/legal/:doc', (req: Request, res: Response) => {
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
    const file = readLegalFile(id, dir);
    res.set('Vary', 'Accept');
    if (wantsMd || /text\/markdown/i.test(req.get('accept') ?? '')) {
      res.type('text/markdown; charset=utf-8').send(file.body_md);
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
