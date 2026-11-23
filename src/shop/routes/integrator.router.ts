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
import { GRANT_SCOPE_WORDS } from '../auth/nonce.service';
import { openHandoff } from '../partner/handoff.service';
import { WEBHOOK_EVENTS } from '../webhook/constants';
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
  /** T-0943: the partner registry (default: config/integrator/partners.json). */
  partners?: readonly Partner[];
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
  /**
   * T-0747 (SOUKBASE-A2B-1109 ruling-1): what a grant gives this partner. `key`: a per-store
   * `mk_live_` key (T-0740). `partner`: no key; the partner pushes the catalog with its own partner
   * key and APIbase creates one grant-owned webhook endpoint at `delivery_webhook_url`.
   */
  grant_mode: 'key' | 'partner';
  /** mode partner only (https): where the grant-owned endpoint delivers. */
  delivery_webhook_url?: string;
  /** mode partner only: the events of that endpoint (non-empty, each in WEBHOOK_EVENTS). */
  delivery_events?: string[];
  /**
   * T-0801 (SELLER-LIVE-1112 ruling-3): the keys step of the connect page for a seller who registers
   * through this partner's handoff and signs the grant. `shown` (default, also when absent) or
   * `hidden` (mode partner only): the page shows no API key and no decryption key.
   */
  seller_keys?: 'shown' | 'hidden';
  /**
   * T-0871 (REQUEST-SOUKBASE-R5-3-1116 ruling-1): the partner may collect the one registration
   * signature on its own page and relay it with its partner key (signature-text, registration).
   * Default false; true only with `seller_keys: hidden`.
   */
  partner_page_signature?: boolean;
  /**
   * T-0943 (REQ-AB-R7-1 item 2): optional https address of the "Back to <name>" link of the partner
   * view of the connect page; absent = `site`.
   */
  back_url?: string;
}

/** T-0943: where the "Back to <partner>" link of the partner view goes. */
export const backUrlOf = (p: Partner): string => p.back_url ?? p.site;

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
    // T-0943: back_url is optional; when present a non-empty https URL, like site.
    if (
      r.back_url !== undefined &&
      (typeof r.back_url !== 'string' || !r.back_url || new URL(r.back_url).protocol !== 'https:')
    )
      throw new Error('partners.json: bad field back_url (https required)');
    // T-0747: grant_mode is required; the delivery fields exist exactly in mode partner.
    if (r.grant_mode === 'key') {
      if (r.delivery_webhook_url !== undefined || r.delivery_events !== undefined)
        throw new Error('partners.json: delivery fields are for grant_mode partner only');
    } else if (r.grant_mode === 'partner') {
      const u = r.delivery_webhook_url;
      if (typeof u !== 'string' || !u || new URL(u).protocol !== 'https:')
        throw new Error('partners.json: bad field delivery_webhook_url (https required)');
      const ev = r.delivery_events;
      if (
        !Array.isArray(ev) ||
        ev.length === 0 ||
        !ev.every((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e as string))
      )
        throw new Error('partners.json: bad field delivery_events');
    } else throw new Error('partners.json: bad field grant_mode');
    // T-0801: seller_keys is shown (default) or hidden; hidden only in mode partner.
    const sk = r.seller_keys === undefined ? 'shown' : r.seller_keys;
    if (sk !== 'shown' && sk !== 'hidden') throw new Error('partners.json: bad field seller_keys');
    if (sk === 'hidden' && r.grant_mode !== 'partner')
      throw new Error('partners.json: seller_keys hidden is for grant_mode partner only');
    p.seller_keys = sk;
    // T-0871: partner_page_signature is a boolean (absent = false); true only with seller_keys hidden.
    const pps = r.partner_page_signature === undefined ? false : r.partner_page_signature;
    if (typeof pps !== 'boolean')
      throw new Error('partners.json: bad field partner_page_signature');
    if (pps && sk !== 'hidden')
      throw new Error('partners.json: partner_page_signature needs seller_keys hidden');
    p.partner_page_signature = pps;
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

/**
 * T-0740: the connect page states of a live partner handoff, composed from the existing components
 * (copy from the card; no new CSS). Each `from` must be in the template: a missing one is a startup
 * bug caught by the tests, never a silent half-rendered page.
 */
const SIG_ROW = (n: number, partner: string, revocable = 'Revocable any time.') =>
  `<li data-n="${n}"><div><b>Allow ${partner} to sell for you</b><span>Uploads your catalog and receives your orders.${revocable ? ` ${revocable}` : ''}</span></div></li>`;
/**
 * T-0943 (REQ-AB-R7-1 item 5): where a person stops the partner, in words; the address links to the
 * partner's row of /integrator/permissions (T-0942). `partner` is already HTML-escaped.
 */
export const STOP_LINE = (partner: string, partnerId: string) =>
  `You can stop ${partner} any time at <a href="/integrator/permissions${partnerId ? `?partner=${encodeURIComponent(partnerId)}` : ''}">apibase.pro/integrator/permissions</a>.`;
/** T-0802: the statements of the one handoff signature, in the order of the message. */
const ONE_SIG_ROWS = (partner: string) =>
  [
    `<li data-n="1"><div><b>Your encryption key</b><span>Lets only you read buyers' order details.</span></div></li>`,
    `<li data-n="2"><div><b>Register your store</b><span>This wallet opens the store at the address from step 1.</span></div></li>`,
    `<li data-n="3"><div><b>Accept the documents</b><span>The four documents of step 2, each with its version and hash.</span></div></li>`,
    SIG_ROW(4, partner),
  ].join('\n');
const SIG_LIST_RE = /(<ol class="cn-sig" id="sig">\n)([\s\S]*?)(<\/ol>)/;
/** T-0873: the one signature row of a grant link that adds scopes to a live grant. */
const ADD_ROW = (partner: string) =>
  `<li data-n="1"><div><b>Add this to ${partner}'s permission</b><span>One free signature. The message you sign states the whole permission, old and new.</span></div></li>`;
const W = GRANT_SCOPE_WORDS;
export function grantVariant(
  body: string,
  partnerName: string,
  v: { mode: 'register' | 'grant'; grant_requested: boolean; scopes?: string[] | null },
  partnerId = '',
): string {
  const pn = esc(partnerName);
  const stop = STOP_LINE(pn, partnerId);
  const swap = (s: string, from: string | RegExp, to: string | ((...m: string[]) => string)) => {
    if (typeof from === 'string' ? !s.includes(from) : !from.test(s))
      throw new Error(`connect.html: grant variant anchor missing: ${String(from)}`);
    return s.replace(from, to as never);
  };
  if (v.mode === 'grant') {
    // T-0873: a link that names scopes adds them to a live grant: the page says only what is added
    const add = v.scopes && v.scopes.length > 0 ? v.scopes.map((s) => esc(W[s] ?? s)) : null;
    let b = swap(
      body,
      '<h1>Connect your store</h1>',
      add
        ? `<h1>One more permission for ${pn}</h1>`
        : `<h1>Allow ${pn} to sell for your store</h1>`,
    );
    b = swap(
      b,
      '<p class="lp-sub">Three steps, about five minutes. It costs nothing.</p>',
      add
        ? `<p class="lp-sub">${pn} already sells for your store. This adds one thing: it may ${add.join('; ')}. Nothing else changes. ${stop}</p>`
        : `<p class="lp-sub">${pn} will ${W['catalog:write']}, ${W['webhooks:write']}, and read the outcome of each quote for your products, never who the buyer is. It gets no access to payouts, keys, orders or refunds. ${stop}</p>`,
    );
    b = swap(b, '<ol class="cn-bar" id="bar">', '<ol class="cn-bar" id="bar" hidden>');
    b = swap(b, '<b>3 free signatures</b>', '<b>1 free signature</b>');
    b = swap(
      b,
      SIG_LIST_RE,
      (_m, a, _rows, c) => `${a}${add ? ADD_ROW(pn) : SIG_ROW(1, pn, '')}\n${c}`, // T-0943: the lead says where to stop it
    );
    b = swap(b, /<div class="cn-cards">.*<\/div>\n/, '');
    b = swap(
      b,
      /<details><summary>Use a different payout wallet<\/summary>[\s\S]*?<\/details>\n/,
      '',
    );
    return swap(b, '<span id="wtn">1</span> of 3', '<span id="wtn">1</span> of 1');
  }
  if (!v.grant_requested) return body;
  // T-0802: a register handoff that asked for the grant is signed once; the list shows what that one
  // message states (encryption key, registration, the four documents, the partner's permission).
  let b = swap(
    body,
    '<p>Your wallet will ask for <b>3 free signatures</b>. No gas, no money leaves your wallet.</p>',
    `<p>One free signature, no gas: it registers your store, records the documents you accept and lets ${pn} sell for it.</p>`,
  );
  // T-0832: the four statements stay in the page (ids and row count for mark() and N) inside a closed details.
  b = swap(
    b,
    SIG_LIST_RE,
    (_m, a, _rows, c) =>
      `<details><summary>What the message says</summary>\n${a}${ONE_SIG_ROWS(pn)}\n${c}\n</details>`,
  );
  return swap(b, '<span id="wtn">1</span> of 3', '<span id="wtn">1</span> of 1');
}

/** T-0869: the four documents, as linked on step 2 (new tab). */
const DOC_LINKS =
  '<a href="/legal/merchant-agreement" target="_blank" rel="noopener">Merchant Agreement</a>, <a href="/legal/aup" target="_blank" rel="noopener">Acceptable Use Policy</a>, <a href="/legal/dpa" target="_blank" rel="noopener">Data Processing Addendum</a> and <a href="/legal/refund-framework" target="_blank" rel="noopener">Refund Framework</a>';
/** T-0869: the prefill keys whose row the page can hide (`data-row`); contact_email is T-0867's line. */
const ROW_RES: Array<[string, RegExp]> = [
  ['name', /^(<label>Shop name<input name="name"[^\n]*)$/m],
  ['site_url', /^(<label>Website<input name="site_url"[^\n]*)$/m],
  ['slug', /^(<label>Shop address[^\n]*\n<p class="hint">Your page:[^\n]*)$/m],
];

/**
 * T-0869 (REQUEST-SOUKBASE-R5-1-1116 ruling-1): one-page mode, applied after grantVariant to a live
 * handoff of mode register with grant_requested. Same elements and ids, rearranged: band, two lines,
 * the visible fields, the document line, one button, everything else under one closed "More options".
 * Which rows hide (a key in the prefill) is decided by the page script, which takes one-page mode from
 * this markup (#more), so the plain page never names the flag.
 */
export function onePageVariant(
  body: string,
  partnerName: string,
  expectedWallet: string | null,
  partnerId = '',
): string {
  const pn = esc(partnerName);
  let b = body;
  const swap = (from: string | RegExp, to: string | ((...m: string[]) => string)) => {
    if (typeof from === 'string' ? !b.includes(from) : !from.test(b))
      throw new Error(`connect.html: one-page anchor missing: ${String(from)}`);
    b = b.replace(from, to as never);
  };
  /** cut a piece out of the page and return it (it is put back inside the fold) */
  const cut = (re: RegExp): string => {
    const m = re.exec(b);
    if (!m) throw new Error(`connect.html: one-page anchor missing: ${String(re)}`);
    b = b.replace(m[0], '');
    return m[0];
  };
  const ew =
    expectedWallet && /^0x[0-9a-f]{40}$/i.test(expectedWallet)
      ? ` (${expectedWallet.slice(0, 6)}…${expectedWallet.slice(-4)})`
      : '';
  swap(
    '<p class="cn-eye">INTEGRATOR · CONNECT</p>',
    `<p class="cn-eye">This is APIbase, the payment partner of ${pn}.</p>`,
  );
  swap(
    '<p class="lp-sub">Three steps, about five minutes. It costs nothing.</p>',
    `<p class="lp-sub">We open the store page apibase.pro/m/<b id="op-slug"></b> for <b id="op-name"></b>, where AI agents order and pay. ${pn} adds your products and receives your orders.</p>\n<p class="lp-sub">Payouts in USDC on Base go to the wallet you sign with${ew}. It costs nothing.</p>`,
  );
  swap('<ol class="cn-bar" id="bar">', '<ol class="cn-bar" id="bar" hidden>');
  for (const h of ['Your store', 'Agreements', 'Connect wallet']) swap(`<h2>${h}</h2>\n`, '');
  for (const [n, re] of ROW_RES) swap(re, (_m, row) => `<div data-row="${n}">\n${row}\n</div>`);
  for (const n of ['category', 'country'])
    swap(
      new RegExp(`<div><label>(?=[A-Za-z]+<select name="${n}")`),
      `<div data-row="${n}"><label>`,
    );
  const support = cut(/<label>Support email \(optional\)[^\n]*\n/);
  cut(/<div class="cn-box"><p>You accept these four documents[^\n]*\n<p class="cn-info">[^\n]*\n/);
  const versions = cut(/<div id="dv">[^\n]*\n<p class="muted">[^\n]*\n/);
  cut(/<p>One free signature, no gas:[^\n]*\n/);
  const sig = cut(
    /<details><summary>What the message says<\/summary>\n<ol class="cn-sig" id="sig">\n[\s\S]*?<\/ol>\n<\/details>\n/,
  )
    .replace('<details><summary>What the message says</summary>\n', '')
    .replace(/<\/details>\n$/, '');
  cut(/<div class="cn-cards">[^\n]*\n/);
  const payout = cut(
    /<details><summary>Use a different payout wallet<\/summary>\n[\s\S]*?<\/details>\n/,
  )
    .replace('<details><summary>Use a different payout wallet</summary>\n', '')
    .replace(/<\/details>\n$/, '');
  const wh = cut(/<p class="hint" id="wh">[^\n]*\n/);
  const sd = (t: string, n: string) => `<p class="hint">${t}: <span data-sd="${n}"></span></p>\n`;
  const fold =
    '<details id="more"><summary>More options</summary>\n' +
    `<h3>What the message says</h3>\n${sig}` +
    `<h3>Store details</h3>\n${sd('Shop name', 'name')}${sd('Website', 'site_url')}${sd('Category', 'category')}${sd('Country', 'country')}` +
    support +
    `<h3>Payout wallet</h3>\n${payout}` +
    '<div id="wsl"></div>\n' +
    wh + // T-0943: no deep links, copy link or agent guide in the fold; #nw keeps them for a browser without a wallet
    versions +
    '</details>\n';
  swap(
    '<p class="cn-nav">',
    `<p id="op-docs">By signing you accept the ${DOC_LINKS}.</p>\n<p class="hint" id="op-stop">${STOP_LINE(pn, partnerId)}</p>\n<p class="cn-nav">`,
  );
  swap(
    /(<p class="cn-nav">[^\n]*<\/p>\n)(<\/form>)/,
    (_m, nav, end) =>
      `${nav}<p class="hint">One free signature. No gas, no money leaves your wallet.</p>\n${fold}${end}`,
  );
  return b;
}

/** T-0943 (REQ-AB-R7-1 item 3): the words of a category slug: dashes to spaces, first letter upper case, SaaS. */
export const categoryLabel = (slug: string): string => {
  const t = slug.replace(/-/g, ' ').replace(/\bsaas\b/g, 'SaaS');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

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
  const REG = opts.partners ?? PARTNERS;
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
    const options = ALLOWED_CATEGORIES.map(
      (c) => `<option value="${esc(c)}">${esc(categoryLabel(c))}</option>`,
    ).join('');
    const from: unknown = req.query.from;
    const partner = typeof from === 'string' ? REG.find((p) => p.id === from) : undefined;
    let partnerHtml = partner
      ? `<input type="hidden" name="partner" value="${esc(partner.id)}" form="f"><a id="pt" class="lp-cta" data-return="${esc(partner.return_url)}" target="_self" hidden>Continue on ${esc(partner.name)}</a>`
      : '';
    // T-0739: a handoff link of a known partner. Live -> prefill; anything else -> one hint line, no echo.
    let hint = '';
    let grantView: {
      mode: 'register' | 'grant';
      grant_requested: boolean;
      scopes?: string[] | null;
    } | null = null;
    let onePage: { expected_wallet: string | null } | null = null;
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
        grantView = {
          mode: live.mode,
          grant_requested: live.grant_requested,
          ...(live.requested_scopes ? { scopes: live.requested_scopes } : {}),
        };
        // T-0832: the hint names what the partner actually passed; no email -> the page asks for it under the field.
        const pe: unknown = (live.prefill as Record<string, unknown> | null)?.contact_email;
        const noEmail = typeof pe !== 'string' || pe.trim() === '';
        // T-0869: one-page mode = a handoff signed once (register + grant_requested); its two lines replace the hint.
        if (live.mode === 'register' && live.grant_requested)
          onePage = { expected_wallet: live.expected_wallet };
        hint =
          live.mode === 'grant' || onePage
            ? ''
            : noEmail
              ? `<p class="hint">Some fields are filled in from ${esc(partner.name)}. Check them and continue.</p>`
              : `<p class="hint">Prefilled from ${esc(partner.name)}. Check the values and continue.</p>`;
        // T-0867: mode grant registers nothing, so a prefill e-mail never reaches its page; in mode register a
        // given e-mail is shown read-only (email_given) and the T-0832 note is only for the missing one.
        const pagePrefill =
          live.mode === 'grant' && live.prefill
            ? Object.fromEntries(
                Object.entries(live.prefill).filter(([k]) => k !== 'contact_email'),
              )
            : live.prefill;
        partnerHtml += `<input type="hidden" name="handoff" value="${esc(live.handoff_id)}" data-partner="${esc(partner.name)}" form="f"><script type="application/json" id="pf">${scriptJson({ prefill: pagePrefill, expected_wallet: live.expected_wallet, mode: live.mode, grant_requested: live.grant_requested, seller_keys: partner.seller_keys ?? 'shown', ...(live.mode !== 'grant' && noEmail ? { email_note: true } : {}), ...(live.mode !== 'grant' && !noEmail ? { email_given: true } : {}), ...(onePage ? { one_page: true } : {}) })}</script>`;
      } else {
        hint = `<p class="hint">This link from ${esc(partner.name)} is no longer valid. You can still connect your store and return there.</p>`;
      }
    }
    let body = renderTokens(read('connect.html'))
      .replace('{{CATEGORY_OPTIONS}}', () => options)
      .replace('{{HANDOFF_HINT}}', () => hint)
      .replace('{{PARTNER}}', () => partnerHtml);
    if (partner && grantView) body = grantVariant(body, partner.name, grantView, partner.id);
    if (partner && onePage)
      body = onePageVariant(body, partner.name, onePage.expected_wallet, partner.id);
    // T-0943: the partner view (live, dead or no handoff) drops the agent line; the shell drops the site menu
    if (partner) body = body.replace(/<p class="cn-foot" id="ft">[^\n]*\n/, '');
    res.type('html').send(
      layout({
        title: 'Connect AI payment | APIbase Integrator',
        description:
          'Connect your shop to APIbase: register the storefront and let buyer AI agents order and pay in USDC.',
        head: CONNECT_HEAD,
        path: '/integrator/connect',
        body,
        scope: 'ig',
        ...(partner ? { partner: { name: partner.name, back: backUrlOf(partner) } } : {}),
      }),
    );
  });
  // T-0942 (REQ-AB-R7-1 item 5): the seller stops a partner with one wallet signature. One row per
  // registry partner; `?partner=<id>` of a registry partner shows only that row, any other value is ignored.
  router.get('/integrator/permissions', limiter, (req, res) => {
    res.set('Vary', 'Accept').set('Cache-Control', 'public, max-age=300');
    if (wantsMd(req)) {
      res.type('text/markdown; charset=utf-8').send(renderTokens(read('permissions.md')));
      return;
    }
    const only: unknown = req.query.partner;
    const one = typeof only === 'string' ? REG.filter((p) => p.id === only) : [];
    const rows = (one.length > 0 ? one : REG)
      .map(
        (p) =>
          `<li class="pm-row" data-partner="${esc(p.id)}" data-name="${esc(p.name)}"><b>${esc(p.name)}</b><button type="button" class="lp-cta" data-stop>Stop ${esc(p.name)}</button><p class="pm-out" role="status" hidden></p></li>`,
      )
      .join('\n');
    res.type('html').send(
      layout({
        title: 'Partners that sell for you | APIbase Integrator',
        description:
          'Stop a partner that sells for your store with one wallet signature. Your store, payouts and orders stay.',
        head: CONNECT_HEAD,
        path: '/integrator/permissions',
        body: renderTokens(read('permissions.html')).replace('{{PARTNER_ROWS}}', () => rows),
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
  for (const n of ['docs', 'connect', 'permissions', ...GUIDES]) {
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
