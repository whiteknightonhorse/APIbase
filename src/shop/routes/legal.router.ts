import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
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
const SITE_ORIGIN = 'https://apibase.pro';

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
  const bps = Number(process.env.INTEGRATOR_FEE_BPS);
  if (process.env.INTEGRATOR_FEE_ENABLED === 'true' && Number.isFinite(bps) && bps > 0) {
    return `${bps / 100}%`;
  }
  return '0% during the pilot';
}

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

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

/** Same nav bar as the /integrator pages (static/integrator/_layout.html). */
const NAV =
  '<nav><a class="brand" href="/">APIbase.pro</a><a href="/catalog">Catalog</a><a href="/shops">Shops</a>' +
  '<a href="/integrator">Integrator</a><a href="/integrator/agent-guide">Agent guide</a>' +
  '<a href="/integrator/buyers">Buyers</a><a href="/pricing">Pricing</a></nav>';
const FOOTER =
  '<footer><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a></footer>';

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

const STYLE =
  'body{background:#0b0e11;color:#d7dde4;font:15px/1.6 ui-monospace,Menlo,Consolas,monospace;margin:0}' +
  'main{max-width:820px;margin:0 auto;padding:24px 16px}a{color:#4cc2ff}' +
  'h1,h2,h3{color:#fff}blockquote{border-left:3px solid #444;margin:0;padding-left:12px;color:#9aa5b1}' +
  'nav{display:flex;flex-wrap:wrap;gap:14px;padding:12px 16px;border-bottom:1px solid #333}nav .brand{font-weight:bold}' +
  'footer{max-width:820px;margin:0 auto;padding:16px;border-top:1px solid #333;color:#9aa5b1}' +
  'code{background:#1a2027;padding:1px 4px}hr{border:0;border-top:1px solid #333;margin:28px 0}';
const DRAFT_STYLE =
  '.draft-banner{background:#7a1f1f;color:#fff;padding:12px 16px;font-weight:bold;text-align:center}';

function page(docId: string, body: string, draft: boolean): string {
  const title = `${docId} — APIbase legal`;
  const desc = firstParagraph(body);
  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<link rel="canonical" href="${SITE_ORIGIN}/legal/${esc(docId)}">` +
    (desc ? `<meta name="description" content="${esc(desc)}">` : '') +
    (draft ? '<meta name="robots" content="noindex">' : '') +
    `<title>${esc(title)}</title><style>${STYLE}${draft ? DRAFT_STYLE : ''}</style></head><body>` +
    (draft ? DRAFT_BANNER : '') +
    NAV +
    `<main>${body}</main>` +
    FOOTER +
    '</body></html>\n'
  );
}

/** Pointers to the static Terms/Privacy pages: sha256 of the HTML bytes, not registry documents. */
export function staticPageEntries(staticDir: string): Array<Record<string, unknown>> {
  return ['terms', 'privacy'].flatMap((id) => {
    const file = resolve(staticDir, `${id}.html`);
    if (!existsSync(file)) return [];
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
    res.type('html').send(page(id, body, !isPublished()));
  });

  return router;
}
