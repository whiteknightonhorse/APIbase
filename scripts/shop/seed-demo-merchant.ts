/**
 * T-INT-20: seeds the APIbase demo merchant (`apibase-demo`) through the PUBLIC API only
 * (no SQL, no database access). Two modes:
 *
 *   --prepare --wallet <addr> --base-url <url>
 *       Asks the server for three single-use messages and prints them. Nothing is written.
 *       The operator signs each one (EIP-191, personal_sign) with the demo-seller identity wallet
 *       and saves {register, accept_terms, encryption_key} signatures in a JSON file.
 *       Nonces live 300 s: sign right away.
 *
 *   --resume --api-key-file <file> --base-url <url> [--webhook-url <https url>]
 *       Runs catalog, webhooks and check with an existing mk_live_ key (first line of the file),
 *       after a --submit died past accept_terms.
 *
 *   --submit --signatures <file> --base-url <url> --payout-base <addr> --payout-tempo <addr>
 *            [--webhook-url <https url>] [--country US] [--contact-email <e-mail>] [--site-url <https url>]
 *       POST /merchants, POST /merchants/me/acceptances, PUT /merchants/me/catalog and, with
 *       --webhook-url, PUT /merchants/me/webhooks, then GET /merchants/me/check.
 *
 * The signatures file:
 *   { "wallet": "0x...",
 *     "register":       { "message": "<printed>", "signature": "0x..." },
 *     "accept_terms":   { "message": "<printed>", "signature": "0x..." },
 *     "encryption_key": { "signature": "0x..." } }
 *
 * --submit writes one JSON line {"step":"accept_terms","merchant_id","api_key"} to stdout right
 * after accept_terms, before the catalog, so a late failure never loses the one-time key.
 *
 * The server stores payout wallets as given: they decide where buyers' USDC goes.
 * The mk_live_ key and the webhook secret are printed once, to stdout only.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const DEMO_SLUG = 'apibase-demo';
export const DEMO_CATEGORY = 'digital-goods';
export const TEST_SKU = '__apibase_test';
export const REFUND_WINDOW_DAYS = 14;

/** The demo shop needs no buyer PII, so the encryption key is a fixed, public placeholder. */
export const ENCRYPTION_KEY = {
  kid: 'demo-1',
  alg: 'x25519',
  pub: createHash('sha256').update('apibase-demo-encryption-key-v1').digest('base64'),
};

/** Same text the server verifies (src/shop/merchant.service.ts encryptionKeyMessage). */
export const encryptionKeyMessage = (k: { kid: string; alg: string; pub: string }): string =>
  `apibase.pro merchant encryption key\nkid: ${k.kid}\nalg: ${k.alg}\npub: ${k.pub}`;

export const DEMO_CATALOG = [
  {
    sku: TEST_SKU,
    title: 'APIbase test item',
    description: 'End-to-end test purchase of the APIbase demo shop.',
    price_usd: 0.01,
    is_test: true,
    fulfillment_mode: 'instant',
    fulfillment: { instant: { payload: 'test ok' } },
    category: DEMO_CATEGORY,
    refund_window_days: REFUND_WINDOW_DAYS,
  },
  {
    sku: 'demo-guide',
    title: 'APIbase agent commerce guide',
    description: 'A short text guide to buying from merchants through an AI agent.',
    price_usd: 1.0,
    fulfillment_mode: 'instant',
    fulfillment: {
      instant: {
        payload:
          'APIbase agent commerce guide: discover a shop, quote the items, pay the quote with x402, read the order.',
      },
    },
    category: DEMO_CATEGORY,
    refund_window_days: REFUND_WINDOW_DAYS,
  },
  {
    sku: 'demo-bundle',
    title: 'APIbase agent commerce bundle',
    description: 'The guide plus a checklist for connecting your own shop.',
    price_usd: 5.0,
    fulfillment_mode: 'instant',
    fulfillment: {
      instant: {
        payload:
          'APIbase agent commerce bundle: the guide, plus the merchant checklist (register, accept terms, upload the catalog, set a webhook, run check).',
      },
    },
    category: DEMO_CATEGORY,
    refund_window_days: REFUND_WINDOW_DAYS,
  },
];

export type FetchFn = typeof fetch;

export interface Signatures {
  wallet: string;
  register: { message: string; signature: string };
  accept_terms: { message: string; signature: string };
  encryption_key: { signature: string };
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

async function call(
  f: FetchFn,
  base: string,
  method: string,
  path: string,
  opts: { key?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, any> }> {
  const res = await f(`${base.replace(/\/+$/, '')}${path}`, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(opts.key ? { authorization: `Bearer ${opts.key}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: Record<string, any> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, any>) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

function must(r: { status: number; body: Record<string, any> }, step: string) {
  if (r.status < 200 || r.status >= 300) {
    const code = String(r.body['error_code'] ?? r.body['error'] ?? 'error');
    throw new Error(`${step} failed: HTTP ${r.status} ${code}: ${String(r.body['message'] ?? '')}`);
  }
  return r.body;
}

export interface PrepareResult {
  wallet: string;
  expires_in: number;
  messages: { register: string; accept_terms: string; encryption_key: string };
}

/** --prepare: reads nonces, writes nothing. */
export async function prepare(
  o: { wallet: string; baseUrl: string },
  f: FetchFn = fetch,
): Promise<PrepareResult> {
  if (!ADDR_RE.test(o.wallet)) throw new Error('--wallet must be an EVM address');
  const nonce = async (purpose: string) =>
    must(
      await call(
        f,
        o.baseUrl,
        'GET',
        `/api/v1/shop/auth/nonce?wallet=${o.wallet}&purpose=${purpose}`,
      ),
      `nonce(${purpose})`,
    );
  const register = await nonce('register');
  const accept = await nonce('accept_terms');
  return {
    wallet: o.wallet,
    expires_in: Math.min(Number(register['expires_in']), Number(accept['expires_in'])),
    messages: {
      register: String(register['message']),
      accept_terms: String(accept['message']),
      encryption_key: encryptionKeyMessage(ENCRYPTION_KEY),
    },
  };
}

export interface SubmitOptions {
  baseUrl: string;
  signatures: Signatures;
  payoutBase: string;
  payoutTempo: string;
  /** Called right after accept_terms, before the catalog, with the one-time key. */
  onAcceptTerms?: (r: { merchant_id: string; api_key: string }) => void;
  webhookUrl?: string;
  country?: string;
  contactEmail?: string;
  siteUrl?: string;
}

export interface SubmitResult {
  merchant_id: string;
  slug: string;
  api_key: string;
  webhook_secret?: string;
  check: Record<string, any>;
}

/** --submit: the whole seed through the public API. */
export async function submit(o: SubmitOptions, f: FetchFn = fetch): Promise<SubmitResult> {
  const s = o.signatures;
  if (!ADDR_RE.test(s.wallet)) throw new Error('signatures.wallet must be an EVM address');
  for (const [k, v] of [
    ['--payout-base', o.payoutBase],
    ['--payout-tempo', o.payoutTempo],
  ]) {
    if (!ADDR_RE.test(v)) throw new Error(`${k} must be an EVM address`);
  }
  const reg = must(
    await call(f, o.baseUrl, 'POST', '/api/v1/shop/merchants', {
      body: {
        wallet: s.wallet,
        slug: DEMO_SLUG,
        name: 'APIbase Demo Shop',
        category: DEMO_CATEGORY,
        country: o.country ?? 'US',
        contact_email: o.contactEmail ?? 'demo@apibase.pro',
        site_url: o.siteUrl ?? 'https://apibase.pro',
        payout_wallet_base: o.payoutBase,
        payout_wallet_tempo: o.payoutTempo,
        encryption_key: { ...ENCRYPTION_KEY, sig_by_wallet: s.encryption_key.signature },
        message: s.register.message,
        signature: s.register.signature,
      },
    }),
    'register',
  );
  const docs = reg['docs_to_accept'] as Array<{ doc_id: string; version: string; sha256: string }>;
  const doc_hashes = docs.map(({ doc_id, version, sha256 }) => ({ doc_id, version, sha256 }));
  for (const d of doc_hashes) {
    if (!s.accept_terms.message.includes(`${d.doc_id} v${d.version} sha256:${d.sha256}`)) {
      throw new Error(
        `the legal documents changed since --prepare (${d.doc_id}); run --prepare again and re-sign`,
      );
    }
  }
  const acc = must(
    await call(f, o.baseUrl, 'POST', '/api/v1/shop/merchants/me/acceptances', {
      body: {
        wallet: s.wallet,
        doc_hashes,
        message: s.accept_terms.message,
        signature: s.accept_terms.signature,
      },
    }),
    'accept_terms',
  );
  const key = String(acc['api_key'] ?? '');
  if (!key) throw new Error('accept_terms returned no api_key (already accepted?)');
  const merchant_id = String(reg['merchant_id']);
  o.onAcceptTerms?.({ merchant_id, api_key: key });
  try {
    return await finish(f, o.baseUrl, key, merchant_id, o.webhookUrl);
  } catch (err) {
    throw new Error(`${(err as Error).message} (api_key already written to stdout)`);
  }
}

export interface ResumeOptions {
  baseUrl: string;
  apiKey: string;
  webhookUrl?: string;
}

/** --resume: catalog, webhooks and check with an existing key. */
export async function resume(o: ResumeOptions, f: FetchFn = fetch): Promise<SubmitResult> {
  if (!o.apiKey) throw new Error('the api key file is empty');
  return finish(f, o.baseUrl, o.apiKey, '', o.webhookUrl);
}

async function finish(
  f: FetchFn,
  baseUrl: string,
  key: string,
  merchant_id: string,
  webhookUrl?: string,
): Promise<SubmitResult> {
  const o = { baseUrl, webhookUrl };
  const cat = must(
    await call(f, o.baseUrl, 'PUT', '/api/v1/shop/merchants/me/catalog', {
      key,
      body: { items: DEMO_CATALOG },
    }),
    'catalog',
  );
  if (cat['upserted'] !== DEMO_CATALOG.length) {
    throw new Error(`catalog: ${String(cat['upserted'])} of ${DEMO_CATALOG.length} items upserted`);
  }
  let webhook_secret: string | undefined;
  if (o.webhookUrl) {
    const wh = must(
      await call(f, o.baseUrl, 'PUT', '/api/v1/shop/merchants/me/webhooks', {
        key,
        body: { url: o.webhookUrl, events: ['order.paid'] },
      }),
      'webhook',
    );
    webhook_secret = typeof wh['secret'] === 'string' ? wh['secret'] : undefined;
  }
  const check = must(
    await call(f, o.baseUrl, 'GET', '/api/v1/shop/merchants/me/check', { key }),
    'check',
  );
  return {
    merchant_id,
    slug: DEMO_SLUG,
    api_key: key,
    webhook_secret,
    check,
  };
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: string[]): Promise<void> {
  const baseUrl = arg(argv, '--base-url');
  if (!baseUrl) throw new Error('--base-url is required');
  if (argv.includes('--prepare')) {
    const wallet = arg(argv, '--wallet');
    if (!wallet) throw new Error('--wallet is required');
    console.log(JSON.stringify(await prepare({ wallet, baseUrl }), null, 2));
    return;
  }
  if (argv.includes('--resume')) {
    const file = arg(argv, '--api-key-file');
    if (!file) throw new Error('--api-key-file is required');
    const apiKey = readFileSync(file, 'utf8').split('\n')[0].trim();
    const r = await resume({ baseUrl, apiKey, webhookUrl: arg(argv, '--webhook-url') });
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (argv.includes('--submit')) {
    const file = arg(argv, '--signatures');
    const payoutBase = arg(argv, '--payout-base');
    const payoutTempo = arg(argv, '--payout-tempo');
    if (!file || !payoutBase || !payoutTempo) {
      throw new Error('--signatures, --payout-base and --payout-tempo are required');
    }
    const signatures = JSON.parse(readFileSync(file, 'utf8')) as Signatures;
    const r = await submit({
      baseUrl,
      signatures,
      payoutBase,
      payoutTempo,
      webhookUrl: arg(argv, '--webhook-url'),
      onAcceptTerms: (r) => console.log(JSON.stringify({ step: 'accept_terms', ...r })),
      country: arg(argv, '--country'),
      contactEmail: arg(argv, '--contact-email'),
      siteUrl: arg(argv, '--site-url'),
    });
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  throw new Error('use --prepare, --submit or --resume');
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
