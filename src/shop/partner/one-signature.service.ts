/**
 * T-0802 (SELLER-LIVE-1112 ruling-3): a partner handoff that asked for the grant is signed once.
 * One server-built message states, in this order, the shop's encryption key, the registration, the
 * four documents (id, version, sha256) and the partner's permission. The page sends only the public
 * key; the browser never composes the text. The nonce record (Redis, 300 s, single use) holds every
 * value of the message, so the verifier rebuilds it and compares byte for byte. One transaction then
 * writes the same records as the per-purpose routes (encryption key, registration, one acceptance per
 * document, grant), each with this message and its signature as the proof, and the handoff ends
 * `granted`. The per-purpose messages and routes are unchanged.
 */
import { createHash, randomBytes } from 'node:crypto';
import { BlockList, isIP } from 'node:net';
import { ShopAuthError } from '../auth/errors';
import { issueKey } from '../auth/merchant-key.service';
import { GRANT_ALLOWS_LINE, NONCE_TTL_S, type NonceRedis } from '../auth/nonce.service';
import { currentDocs, REQUIRED_DOCS, termsNotAccepted, type LegalDoc } from '../auth/terms.guard';
import type { ShopTx } from '../db';
import { countryOf } from '../geo-lookup';
import { acceptanceMethod, writeAcceptances, type ShopDeps } from '../merchant-lifecycle.service';
import { MerchantRegisterError, registerMerchant, type RegisterCtx } from '../merchant.service';
import { QuoteError } from '../quote.errors';
import {
  verifyWalletSignature as checkWalletSignature,
  type SignerKind,
} from '../wallet-signature';
import { findPartner, grantExists, writeGrant, type PartnerRef } from './grant.service';
import { bindHandoff, PREFILL_KEYS, UUID_RE, type Prefill } from './handoff.service';

const DOC = '/integrator/docs#partner-handoff';
const PREFIX = 'shop:hnonce:';
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const KID_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** raw X25519 public key (32 bytes), standard base64 as the page exports it */
const PUB_RE = /^[A-Za-z0-9+/]{43}=$/;
const TAIL_RE = /\nNonce: ([0-9a-f]{32})\nIssued At: (\S+)$/;
/** T-0871: a hex wallet signature (EOA 65 bytes, or a longer contract-wallet signature). */
const SIG_RE = /^0x[0-9a-fA-F]{2,32768}$/;

/** T-0942: the plain line of both handoff texts that names the page where a seller stops a partner. */
export const STOP_LINE = 'You can stop this any time at apibase.pro/integrator/permissions.';

/** One statement of a combined message: a heading line and its value lines. */
export interface Statement {
  heading: string;
  lines: string[];
}

/**
 * The builder: a plain first line, then each statement numbered in the given order, then the nonce
 * and the time. It takes any list of statements (the direct flow may use it later by a separate ruling).
 */
export function statementsMessage(p: {
  title: string;
  /** optional plain lines right after the title (T-0868) */
  plain?: string[];
  /** optional heading line before the numbered statements (T-0868) */
  detailsHeading?: string;
  statements: Statement[];
  nonce: string;
  issuedAt: string;
}): string {
  const body = p.statements.map((s, i) => [`${i + 1}. ${s.heading}`, ...s.lines].join('\n'));
  const head = [p.title, ...(p.plain ?? []), ...(p.detailsHeading ? [p.detailsHeading] : [])];
  return [...head, ...body, `Nonce: ${p.nonce}`, `Issued At: ${p.issuedAt}`].join('\n');
}

/** The value lines of the encryption-key statement are the lines of the per-purpose key text. */
export const encryptionKeyStatement = (k: {
  kid: string;
  alg: string;
  pub: string;
}): Statement => ({
  heading: 'Encryption key of the shop',
  lines: [`kid: ${k.kid}`, `alg: ${k.alg}`, `pub: ${k.pub}`],
});
export const registrationStatement = (address: string): Statement => ({
  heading: 'Registration',
  lines: [`Address: ${address}`, 'Purpose: register'],
});
export const documentsStatement = (
  docs: Array<Pick<LegalDoc, 'doc_id' | 'version' | 'sha256'>>,
): Statement => ({
  heading: 'I accept the APIbase documents',
  lines: docs.map((d) => `${d.doc_id} v${d.version} sha256:${d.sha256}`),
});
/** The value lines of the per-purpose grant text (nonce.service grantMessage), word for word. */
export const permissionStatement = (partner: { id: string; name: string }): Statement => ({
  heading: `Permission for ${partner.name}`,
  lines: [
    `Partner: ${partner.id}`,
    GRANT_ALLOWS_LINE,
    'Does not allow: payouts, keys, orders, refunds',
    `Revoke any time: DELETE /api/v1/shop/merchants/me/grants/${partner.id}`,
  ],
});

/** Everything the message states; kept as the nonce record. */
export interface HandoffNonceRecord {
  address: string;
  handoff_id: string;
  partner_id: string;
  slug: string;
  kid: string;
  alg: 'x25519';
  pub: string;
  docs: Array<{ doc_id: string; version: string; sha256: string }>;
  nonce: string;
  issued_at: string;
}

/** T-0868: the plain-language name of each required document, one map keyed by doc_id. */
const DOC_NAMES: Record<string, string> = {
  'merchant-agreement': 'Merchant Agreement',
  aup: 'Acceptable Use Policy',
  dpa: 'Data Processing Addendum',
  'refund-framework': 'Refund Framework',
};

function docName(id: string): string {
  const n = DOC_NAMES[id];
  if (!n) throw new Error(`no plain name for required document ${id}`);
  return n;
}

function docNames(): string {
  return REQUIRED_DOCS.map(docName).join(', ');
}

/**
 * T-0868: four plain lines for the person (T-0942: five, with STOP_LINE), then "Technical details" and the statements (key,
 * registration, hashes, permission) unchanged, then nonce and time.
 */
export function handoffMessage(
  r: HandoffNonceRecord,
  partner: { id: string; name: string },
): string {
  const allows = GRANT_ALLOWS_LINE.replace(/^Allows: /, '');
  return statementsMessage({
    title: `APIbase (apibase.pro): open my shop apibase.pro/m/${r.slug} and let ${partner.name} sell for it.`,
    plain: [
      `I accept the four APIbase documents: ${docNames()}.`,
      `${partner.name} may: ${allows}. It may not touch payouts, keys, orders or refunds.`,
      STOP_LINE,
      'This is a signature only: no transaction, no payment, no gas.',
    ],
    detailsHeading: 'Technical details',
    statements: [
      encryptionKeyStatement(r),
      registrationStatement(r.address),
      documentsStatement(r.docs),
      permissionStatement(partner),
    ],
    nonce: r.nonce,
    issuedAt: r.issued_at,
  });
}

const invalid = (field: string, message = `${field} is invalid`) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', {
    field,
    documentation_url: DOC,
  });

interface HandoffRow {
  partner_id: string;
  mode: string;
  grant_requested: boolean;
  expected_wallet: string | null;
  state: string;
  live: boolean;
  /** T-0871: the partner-page path registers from the prefill */
  prefill: Prefill | null;
}

async function handoffRow(db: ShopTx, handoff_id: string): Promise<HandoffRow | null> {
  const rows = await db.$queryRawUnsafe<HandoffRow[]>(
    `SELECT partner_id, mode, grant_requested, expected_wallet, state, (expires_at > now()) AS live,
            prefill
       FROM shop_partner_handoffs WHERE handoff_id = $1::uuid`,
    handoff_id,
  );
  return rows[0] ?? null;
}

/** Live (unexpired, created or opened), mode register, asked for the grant. */
const isLiveRegisterGrant = (h: HandoffRow): boolean =>
  h.live &&
  (h.state === 'created' || h.state === 'opened') &&
  h.mode === 'register' &&
  h.grant_requested;

async function liveHandoff(db: ShopTx, handoff_id: string): Promise<HandoffRow | null> {
  const h = await handoffRow(db, handoff_id);
  return h && isLiveRegisterGrant(h) ? h : null;
}

const wrongWallet = () =>
  new ShopAuthError(
    401,
    'this wallet is not the wallet the partner expects for this handoff',
    'connect the wallet you use on the partner',
  );

/** The same 409s as POST /merchants, before anything is signed. */
async function takenCheck(db: ShopTx, slug: string, wallet: string): Promise<void> {
  const taken = await db.$queryRawUnsafe<Array<{ slug: string; wallet_address: string }>>(
    `SELECT slug, wallet_address FROM shop_merchants WHERE slug = $1 OR wallet_address = $2`,
    slug,
    wallet,
  );
  if (taken.some((t) => t.wallet_address === wallet))
    throw new MerchantRegisterError(
      409,
      'wallet_registered',
      'wallet already registered',
      'fix_request',
      '/integrator/docs',
    );
  if (taken.length > 0)
    throw new MerchantRegisterError(
      409,
      'slug_taken',
      'slug already registered',
      'fix_request',
      '/integrator/docs',
    );
}

async function docsNow(d: ShopDeps): Promise<LegalDoc[]> {
  const docs = await currentDocs(d.db, (d.now ?? Date.now)());
  if (docs.length !== REQUIRED_DOCS.length) {
    throw new ShopAuthError(503, 'legal documents unavailable', 'retry shortly');
  }
  return docs;
}

async function redisOf(d: ShopDeps): Promise<NonceRedis> {
  if (d.redis) return d.redis;
  const { ensureRedisConnected } = await import('../../services/redis.service');
  return (await ensureRedisConnected()) as unknown as NonceRedis;
}

/**
 * GET /api/v1/shop/auth/nonce?purpose=handoff&wallet=&handoff=&slug=&kid=&pub= : the combined message
 * for a live register handoff that asked for the grant. Refuses before anything is signed what the
 * write would refuse: another wallet than the handoff expects, a wallet or slug already taken.
 */
export async function issueHandoffNonce(
  d: ShopDeps,
  q: { wallet: unknown; handoff: unknown; slug: unknown; kid: unknown; pub: unknown },
): Promise<{ nonce: string; issued_at: string; expires_in: number; message: string }> {
  if (typeof q.wallet !== 'string' || !ADDR_RE.test(q.wallet)) throw invalid('wallet');
  if (typeof q.handoff !== 'string' || !UUID_RE.test(q.handoff)) throw invalid('handoff');
  if (typeof q.slug !== 'string' || !SLUG_RE.test(q.slug)) throw invalid('slug');
  if (typeof q.kid !== 'string' || !KID_RE.test(q.kid)) throw invalid('kid');
  if (typeof q.pub !== 'string' || !PUB_RE.test(q.pub)) throw invalid('pub');
  const wallet = q.wallet.toLowerCase();
  const h = await liveHandoff(d.db, q.handoff);
  const p = h ? await findPartner(h.partner_id) : undefined;
  if (!h || !p) {
    throw invalid('handoff', 'handoff is not a live register handoff that asked for the grant');
  }
  if (h.expected_wallet && h.expected_wallet !== wallet) throw wrongWallet();
  await takenCheck(d.db, q.slug, wallet);
  const docs = await docsNow(d);
  const r: HandoffNonceRecord = {
    address: q.wallet,
    handoff_id: q.handoff.toLowerCase(),
    partner_id: p.id,
    slug: q.slug,
    kid: q.kid,
    alg: 'x25519',
    pub: q.pub,
    docs: docs.map(({ doc_id, version, sha256 }) => ({ doc_id, version, sha256 })),
    nonce: randomBytes(16).toString('hex'),
    issued_at: new Date((d.now ?? Date.now)()).toISOString(),
  };
  try {
    await (await redisOf(d)).set(PREFIX + r.nonce, JSON.stringify(r), 'EX', NONCE_TTL_S);
  } catch {
    throw new ShopAuthError(503, 'nonce store unavailable', 'retry shortly');
  }
  return {
    nonce: r.nonce,
    issued_at: r.issued_at,
    expires_in: NONCE_TTL_S,
    message: handoffMessage(r, p),
  };
}

export interface HandoffRegisterResult {
  merchant_id: string;
  slug: string;
  status: 'active';
  handoff: { handoff_id: string; state: 'granted' };
  grant: { grant_id: string; partner: string; mode: string; scopes: string[]; created_at: string };
  /** only for a partner whose registry `seller_keys` is not `hidden` */
  api_key?: string;
}

/**
 * T-0871: what both one-signature paths check once the signed text is known: freshness, the wallet
 * signature over it, the handoff still live and of this partner, its expected wallet, and documents
 * unchanged since the text was issued (else 428 terms_not_accepted). `field` names the handoff in a 422.
 */
async function verifySigned(
  d: ShopDeps,
  r: HandoffNonceRecord,
  p: PartnerRef,
  proof: { message: string; signature: string },
  lower: string,
  field: string,
): Promise<{ signer_kind: SignerKind; docs: LegalDoc[]; h: HandoffRow }> {
  const age = ((d.now ?? Date.now)() - Date.parse(r.issued_at)) / 1000;
  if (!Number.isFinite(age) || age > NONCE_TTL_S || age < -NONCE_TTL_S) {
    throw new ShopAuthError(401, 'handoff message expired');
  }
  const sig = await checkWalletSignature({ address: r.address, ...proof });
  if (!sig.ok) throw new ShopAuthError(401, 'invalid signature');
  const h = await liveHandoff(d.db, r.handoff_id);
  if (!h || h.partner_id !== p.id) {
    throw invalid(field, 'handoff is no longer live');
  }
  if (h.expected_wallet && h.expected_wallet !== lower) throw wrongWallet();
  const docs = await docsNow(d);
  const same =
    docs.length === r.docs.length &&
    docs.every(
      (c, i) =>
        c.doc_id === r.docs[i].doc_id &&
        c.version === r.docs[i].version &&
        c.sha256 === r.docs[i].sha256,
    );
  if (!same) throw termsNotAccepted(docs);
  return { signer_kind: sig.signer_kind, docs, h };
}

/**
 * T-0871: the one transaction of both one-signature paths: registration (with the record's key, the
 * signature as `sig_by_wallet` and the text as `signed_message`), handoff binding, one acceptance per
 * document, status active, grant; an API key only when `mintKey`.
 */
async function writeSigned(
  d: ShopDeps,
  o: {
    r: HandoffNonceRecord;
    p: PartnerRef;
    docs: LegalDoc[];
    signer_kind: SignerKind;
    lower: string;
    proof: { message: string; signature: string };
    /** the merchant fields handed to registerMerchant (wallet, slug and key are the record's) */
    fields: object;
    ctx: Partial<RegisterCtx>;
    path: string;
    field: string;
    mintKey: boolean;
  },
): Promise<HandoffRegisterResult> {
  const { r, p, docs, signer_kind, lower, proof } = o;
  const out = await d
    .transaction(async (tx) => {
      const reg = await registerMerchant(
        {
          ...o.fields,
          wallet: r.address,
          slug: r.slug,
          handoff_id: undefined, // bound below: here a stale handoff fails the whole write
          encryption_key: {
            kid: r.kid,
            alg: r.alg,
            pub: r.pub,
            sig_by_wallet: proof.signature,
            signed_message: proof.message,
          },
          signed: proof,
        } as never,
        {
          ...o.ctx,
          db: tx,
          eventsDb: d.db,
          redis: d.redis,
          now: d.now,
          path: o.path,
        },
        { signer_kind, ...proof },
      );
      if (!(await bindHandoff(tx, r.handoff_id, reg.merchant_id, r.slug, lower))) {
        throw invalid(o.field, 'handoff is no longer live');
      }
      await writeAcceptances(tx, reg.merchant_id, docs, {
        method: acceptanceMethod(signer_kind, 'wallet_signature'),
        signer: lower,
        ...proof,
        ip: o.ctx.ip,
        user_agent: o.ctx.user_agent,
      });
      await tx.$executeRawUnsafe(
        `UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid AND status = 'pending'`,
        reg.merchant_id,
      );
      const g = await writeGrant(d, tx, { merchant_id: reg.merchant_id, slug: r.slug }, p, {
        handoff_id: r.handoff_id,
        wallet: lower,
        proof,
      });
      if (!g.handoff_bound) throw invalid(o.field, 'handoff is no longer live');
      const api_key = o.mintKey
        ? await issueKey(tx, reg.merchant_id, undefined, 'initial')
        : undefined;
      return { merchant_id: reg.merchant_id, grant: g.grant, api_key };
    })
    .catch((e: unknown) => {
      if (/shop_partner_grants_active_uq/.test(String((e as Error)?.message)))
        throw grantExists(p.id);
      throw e;
    });
  d.onRegistered?.(r.slug);
  const g = out.grant;
  return {
    merchant_id: out.merchant_id,
    slug: r.slug,
    status: 'active',
    handoff: { handoff_id: r.handoff_id, state: 'granted' },
    grant: {
      grant_id: g.grant_id,
      partner: g.partner,
      mode: g.mode,
      scopes: g.scopes,
      created_at: g.created_at,
    },
    ...(out.api_key ? { api_key: out.api_key } : {}),
  };
}

/**
 * POST /api/v1/shop/merchants/handoff: verify the one signature once, then write every record in one
 * transaction. Partner with `seller_keys: hidden`: no API key is minted (the registration needs none;
 * the owner page and keys/reissue work with the wallet). Otherwise the key is minted and returned once.
 */
export async function registerByHandoff(
  d: ShopDeps,
  body: unknown,
  ctx: Partial<RegisterCtx> = {},
): Promise<HandoffRegisterResult> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const { wallet, handoff_id, message, signature } = b;
  if (typeof wallet !== 'string' || !ADDR_RE.test(wallet)) throw invalid('wallet');
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) throw invalid('handoff_id');
  if (typeof message !== 'string' || typeof signature !== 'string') {
    throw new ShopAuthError(401, 'wallet signature required', 'sign the handoff message');
  }
  const tail = TAIL_RE.exec(message);
  if (!tail) throw new ShopAuthError(401, 'malformed handoff message');
  // single use: the record is taken before anything else is checked
  const raw = await takeRecord(d, PREFIX + tail[1]);
  if (!raw) throw new ShopAuthError(401, 'nonce unknown, expired or used');
  const r = JSON.parse(raw) as HandoffNonceRecord;
  const p = await findPartner(r.partner_id);
  if (!p) throw new ShopAuthError(401, 'partner no longer registered');
  if (message !== handoffMessage(r, p)) {
    throw new ShopAuthError(
      401,
      'message does not match the nonce message',
      'sign the message returned by GET /auth/nonce?purpose=handoff',
    );
  }
  const lower = wallet.toLowerCase();
  if (r.address.toLowerCase() !== lower || r.handoff_id !== handoff_id.toLowerCase()) {
    throw new ShopAuthError(401, 'message does not match wallet/handoff');
  }
  if (b.slug !== undefined && b.slug !== r.slug)
    throw invalid('slug', 'slug differs from the signed message');
  const proof = { message, signature };
  const v = await verifySigned(d, r, p, proof, lower, 'handoff_id');
  return writeSigned(d, {
    r,
    p,
    docs: v.docs,
    signer_kind: v.signer_kind,
    lower,
    proof,
    fields: b,
    ctx,
    path: '/api/v1/shop/merchants/handoff',
    field: 'handoff_id',
    mintKey: p.seller_keys !== 'hidden',
  });
}

async function takeRecord(d: ShopDeps, key: string): Promise<string | null> {
  try {
    return await (await redisOf(d)).getdel(key);
  } catch {
    throw new ShopAuthError(503, 'nonce store unavailable', 'retry shortly');
  }
}

// ---------------------------------------------------------------------------------------------
// T-0871 (REQUEST-SOUKBASE-R5-3-1116 ruling-1): the one registration signature collected on the
// partner's own page. The partner asks for the text with its partner key, the seller signs it there
// with personal_sign, the partner relays the signature server to server. No key pair is made: the
// shop gets a placeholder encryption key computed from the handoff id, which nobody can open, and
// no API key is minted. The shop's fields come from the handoff prefill only.
// ---------------------------------------------------------------------------------------------

/** A registry partner as the partner routes carry it (req.partner). */
export type PagePartner = PartnerRef & { site: string; partner_page_signature?: boolean };

const PPREFIX = 'shop:ppnonce:';
const PAGE_DOC = '/integrator/docs#partner-page-signature';
const PAGE_PATH = '/api/v1/shop/partners/handoffs/:id/registration';
const PLACEHOLDER_TEXT = 'apibase.pro shop without a decryption key\n';
const UA_MAX = 512;

/**
 * The placeholder encryption key of a shop registered on the partner's page: kid `none-<handoff_id>`,
 * pub = base64 of sha256 over `apibase.pro shop without a decryption key\n<handoff_id>` (lower-case id).
 * Deterministic; no random bytes and no key pair, so no private half exists anywhere.
 */
export function placeholderEncryptionKey(handoff_id: string): {
  kid: string;
  alg: 'x25519';
  pub: string;
} {
  const id = handoff_id.toLowerCase();
  return {
    kid: `none-${id}`,
    alg: 'x25519',
    pub: createHash('sha256')
      .update(PLACEHOLDER_TEXT + id, 'utf8')
      .digest('base64'),
  };
}

/**
 * The text signed on the partner's page: plain lines for the person (documents with versions,
 * what the partner may do, where to stop it (T-0942), payouts and the missing decryption key, no transaction), then "Technical
 * details": registration with the handoff id, document hashes, permission, the placeholder key.
 */
export function partnerPageMessage(
  r: HandoffNonceRecord,
  partner: { id: string; name: string; site: string },
): string {
  const allows = GRANT_ALLOWS_LINE.replace(/^Allows: /, '');
  const versions = REQUIRED_DOCS.map((id) => {
    const doc = r.docs.find((x) => x.doc_id === id);
    if (!doc) throw new Error(`no version for required document ${id}`);
    return `${docName(id)} v${doc.version}`;
  }).join(', ');
  const reg = registrationStatement(r.address);
  return statementsMessage({
    title: `APIbase (apibase.pro), asked on ${new URL(partner.site).host}: open my shop apibase.pro/m/${r.slug} and let ${partner.name} sell for it.`,
    plain: [
      `I accept the four APIbase documents: ${versions}. Texts: https://apibase.pro/legal`,
      `${partner.name} may: ${allows}. It may not touch payouts, keys, orders or refunds.`,
      STOP_LINE,
      'Payouts go to this wallet. The shop starts without a decryption key.',
      'This is a signature only: no transaction, no payment, no gas.',
    ],
    detailsHeading: 'Technical details',
    statements: [
      { heading: reg.heading, lines: [...reg.lines, `Handoff: ${r.handoff_id}`] },
      documentsStatement(r.docs),
      permissionStatement(partner),
      encryptionKeyStatement(r),
    ],
    nonce: r.nonce,
    issuedAt: r.issued_at,
  });
}

const pageInvalid = (field: string, message = `${field} is invalid`) =>
  new QuoteError(422, 'validation_failed', message, 'fix_request', {
    field,
    documentation_url: PAGE_DOC,
  });
const pageNotFound = () =>
  new QuoteError(404, 'not_found', 'no such handoff for this partner', 'fix_request', {
    documentation_url: PAGE_DOC,
  });
const pageOff = () =>
  new QuoteError(
    403,
    'partner_page_signature_off',
    'this partner may not collect the registration signature on its own page; use the handoff url',
    'fix_request',
    { documentation_url: PAGE_DOC },
  );

/** The body as an object of only the `allowed` keys; an unknown key is 422 naming it. */
function bodyOf(body: unknown, allowed: readonly string[]): Record<string, unknown> {
  const b = body === undefined || body === null ? {} : body;
  if (typeof b !== 'object' || Array.isArray(b)) throw pageInvalid('body');
  for (const k of Object.keys(b)) {
    if (!allowed.includes(k)) throw pageInvalid(k, `${k} is not a field of this request`);
  }
  return b as Record<string, unknown>;
}

/** All six prefill keys as strings, in PREFILL_KEYS order; the first missing one is 422 `prefill.<key>`. */
function fullPrefill(h: HandoffRow): Required<Prefill> {
  const pf = (h.prefill ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of PREFILL_KEYS) {
    const v = pf[k];
    if (typeof v !== 'string' || !v)
      throw pageInvalid(`prefill.${k}`, `the handoff has no prefill.${k}`);
    out[k] = v;
  }
  return out as Required<Prefill>;
}

const NON_PUBLIC = (() => {
  const b = new BlockList();
  const v4: Array<[string, number]> = [
    ['0.0.0.0', 8], // this network
    ['10.0.0.0', 8], // private
    ['100.64.0.0', 10], // CGNAT
    ['127.0.0.0', 8], // loopback
    ['169.254.0.0', 16], // link-local
    ['172.16.0.0', 12], // private
    ['192.0.0.0', 24], // protocol assignments
    ['192.0.2.0', 24], // documentation
    ['192.168.0.0', 16], // private
    ['198.18.0.0', 15], // benchmarking
    ['198.51.100.0', 24], // documentation
    ['203.0.113.0', 24], // documentation
    ['224.0.0.0', 4], // multicast
    ['240.0.0.0', 4], // reserved, broadcast
  ];
  const v6: Array<[string, number]> = [
    ['::', 128], // unspecified
    ['::1', 128], // loopback
    ['100::', 64], // discard
    ['2001:db8::', 32], // documentation
    ['fc00::', 7], // unique local (private)
    ['fe80::', 10], // link-local
    ['fec0::', 10], // site-local (deprecated)
    ['ff00::', 8], // multicast
  ];
  for (const [a, n] of v4) b.addSubnet(a, n, 'ipv4');
  for (const [a, n] of v6) b.addSubnet(a, n, 'ipv6');
  return b;
})();

/** A public unicast address (node:net isIP, then not private, loopback, link-local, CGNAT, reserved). */
export function isPublicIp(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 64) return false;
  const fam = isIP(v);
  if (fam === 0) return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (mapped) return isPublicIp(mapped[1]);
  // IPv4-mapped in hex form: refused (a rule ::ffff:0:0/96 in the BlockList would also match IPv4)
  if (/^::ffff:/i.test(v)) return false;
  try {
    return !NON_PUBLIC.check(v, fam === 4 ? 'ipv4' : 'ipv6');
  } catch {
    return false;
  }
}

/**
 * POST /api/v1/shop/partners/handoffs/:id/signature-text {wallet}: the text the seller signs on the
 * partner's page. Refuses before anything is signed what the registration would refuse. One live text
 * per handoff (Redis `shop:ppnonce:<handoff_id>`, 300 s): a second call replaces the first.
 */
export async function issuePartnerPageText(
  d: ShopDeps,
  partner: PagePartner,
  handoff_id: unknown,
  body: unknown,
): Promise<{ handoff_id: string; message: string; issued_at: string; expires_in: number }> {
  const b = bodyOf(body, ['wallet']);
  if (typeof b.wallet !== 'string' || !ADDR_RE.test(b.wallet)) throw pageInvalid('wallet');
  if (partner.partner_page_signature !== true) throw pageOff();
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) throw pageNotFound();
  const id = handoff_id.toLowerCase();
  const h = await handoffRow(d.db, id);
  if (!h || h.partner_id !== partner.id) throw pageNotFound();
  if (!isLiveRegisterGrant(h)) {
    throw pageInvalid('handoff', 'handoff is not a live register handoff that asked for the grant');
  }
  if (!h.expected_wallet) {
    throw pageInvalid('expected_wallet', 'the handoff has no expected_wallet');
  }
  const pf = fullPrefill(h);
  const wallet = b.wallet.toLowerCase();
  if (h.expected_wallet !== wallet) throw wrongWallet();
  await takenCheck(d.db, pf.slug, wallet);
  const docs = await docsNow(d);
  const r: HandoffNonceRecord = {
    address: b.wallet,
    handoff_id: id,
    partner_id: partner.id,
    slug: pf.slug,
    ...placeholderEncryptionKey(id),
    docs: docs.map(({ doc_id, version, sha256 }) => ({ doc_id, version, sha256 })),
    nonce: randomBytes(16).toString('hex'),
    issued_at: new Date((d.now ?? Date.now)()).toISOString(),
  };
  const message = partnerPageMessage(r, partner);
  try {
    await (await redisOf(d)).set(PPREFIX + id, JSON.stringify(r), 'EX', NONCE_TTL_S);
  } catch {
    throw new ShopAuthError(503, 'nonce store unavailable', 'retry shortly');
  }
  return { handoff_id: id, message, issued_at: r.issued_at, expires_in: NONCE_TTL_S };
}

/**
 * POST /api/v1/shop/partners/handoffs/:id/registration {wallet, signature, seller_ip,
 * seller_user_agent?}: the text is taken (single use) and rebuilt from its record, the signature is
 * checked as on POST /merchants/handoff, and the same records are written in one transaction from the
 * handoff prefill, with the placeholder key and no API key. The sign-up country rule applies to
 * `seller_ip` (the address the partner saw on the seller's browser request).
 */
export async function registerByPartnerPage(
  d: ShopDeps,
  partner: PagePartner,
  handoff_id: unknown,
  body: unknown,
  ctx: Partial<RegisterCtx> = {},
): Promise<Omit<HandoffRegisterResult, 'api_key'>> {
  const b = bodyOf(body, ['wallet', 'signature', 'seller_ip', 'seller_user_agent']);
  const { wallet, signature, seller_ip, seller_user_agent } = b;
  if (typeof wallet !== 'string' || !ADDR_RE.test(wallet)) throw pageInvalid('wallet');
  if (typeof signature !== 'string' || !SIG_RE.test(signature)) throw pageInvalid('signature');
  if (!isPublicIp(seller_ip)) {
    throw pageInvalid('seller_ip', 'seller_ip must be the public address of the seller');
  }
  if (
    seller_user_agent !== undefined &&
    (typeof seller_user_agent !== 'string' || seller_user_agent.length > UA_MAX)
  ) {
    throw pageInvalid('seller_user_agent', `seller_user_agent is a string of at most ${UA_MAX}`);
  }
  if (partner.partner_page_signature !== true) throw pageOff();
  if (typeof handoff_id !== 'string' || !UUID_RE.test(handoff_id)) throw pageNotFound();
  const id = handoff_id.toLowerCase();
  // single use: the text is taken before anything else is checked
  const raw = await takeRecord(d, PPREFIX + id);
  if (!raw) throw new ShopAuthError(401, 'nonce unknown, expired or used');
  const r = JSON.parse(raw) as HandoffNonceRecord;
  if (r.partner_id !== partner.id) throw pageNotFound();
  const message = partnerPageMessage(r, partner);
  const lower = wallet.toLowerCase();
  if (r.address.toLowerCase() !== lower || r.handoff_id !== id) {
    throw new ShopAuthError(401, 'message does not match wallet/handoff');
  }
  const proof = { message, signature };
  const v = await verifySigned(d, r, partner, proof, lower, 'handoff');
  const pf = fullPrefill(v.h);
  if (pf.slug !== r.slug)
    throw pageInvalid('prefill.slug', 'the prefill slug differs from the signed text');
  const out = await writeSigned(d, {
    r,
    p: partner,
    docs: v.docs,
    signer_kind: v.signer_kind,
    lower,
    proof,
    fields: {
      name: pf.name,
      site_url: pf.site_url,
      contact_email: pf.contact_email,
      category: pf.category,
      country: pf.country,
      slug: pf.slug,
    },
    ctx: {
      ...ctx,
      ip: seller_ip,
      ip_country: countryOf(seller_ip),
      ip_region: null,
      user_agent: seller_user_agent,
    },
    path: PAGE_PATH,
    field: 'handoff',
    mintKey: false,
  });
  const { api_key: _none, ...result } = out;
  return result;
}
