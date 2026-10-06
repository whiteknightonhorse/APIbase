/**
 * T-INT-21 PII-1..PII-8 (spec 9 "shop-pii-never-plaintext", 10): buyer data reaches the server only as
 * an end-to-end encrypted envelope. Real Express routers (order, merchant, /mcp/m/:slug), the real
 * x402 middleware, the real escrow/settle/delivery code, the real sweeper and a real Postgres
 * (TEST_DATABASE_URL, disposable; skipped without it like the other shop suites). Mocked rails only,
 * as in T-INT-20. The "agent" encrypts in the test (HPKE RFC 9180 written against node:crypto,
 * and a sealed-box-shaped blob) with the key it reads from the quote; the server has no decrypt path.
 * pino is captured in memory and every check scans it, the response and `pg_dump` of all shop_* tables.
 */
import { execFileSync } from 'node:child_process';
import {
  type CipherGCM,
  type DecipherGCM,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { redactObject } from '../../src/config/logger';
import { toMicroUsdc } from '../../src/config/x402.config';
import { runShopSlaSweeper } from '../../src/jobs/shop-sla-sweeper.job';
import { createMcpRouter } from '../../src/mcp/server';
import { errorHandlerMiddleware } from '../../src/middleware/error-handler.middleware';
import { mppMiddleware } from '../../src/middleware/mpp.middleware';
import { x402Middleware } from '../../src/middleware/x402.middleware';
import { processEvent, type ProcessorDeps } from '../../src/outbox/processor';
import { encryptSecret } from '../../src/services/secret-crypto.service';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { clearStorefrontCache } from '../../src/shop/merchant-mcp-server';
import { encryptionKeyMessage } from '../../src/shop/merchant.service';
import { createMerchantRouter } from '../../src/shop/routes/merchant.router';
import { createOrderRouter } from '../../src/shop/routes/order.router';
import { deliverDue, type DeliveryDeps } from '../../src/shop/webhook/delivery.service';
import { setWebhook } from '../../src/shop/webhook/webhook.service';
import type { WebhookTransport } from '../../src/shop/webhook/transport';
import { client, dbDescribe, migrate, mkMerchant } from '../unit/helpers/shop-db';

// ledger.service builds its own lazy PrismaClient from the default connection variable: point it at
// the disposable DB before the first write so no other database can receive these rows.
if (process.env['TEST_DATABASE_URL'])
  process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];

const mockDb: { c?: ReturnType<typeof client> } = {};
jest.mock('../../src/services/prisma.service', () => ({ getPrisma: () => mockDb.c }));
jest.mock('../../src/config/index', () => ({
  config: {
    ENCRYPTION_KEY: 'k'.repeat(40),
    X402_NETWORK: 'base',
    X402_PAYMENT_ADDRESS: '0x50EbDa9dA5dC19c302Ca059d7B9E06e264936480',
    X402_FACILITATOR_URL: 'https://facilitator.example',
    X402_FACILITATOR_MODE: 'local',
    X402_OPERATOR_PRIVATE_KEY: '0x00',
    X402_BASE_RPC_URL: 'https://base.example',
    X402_BASE_SEPOLIA_RPC_URL: 'https://sepolia.example',
    X402_OPERATOR_MIN_ETH_BALANCE: 0.01,
  },
}));
// The REAL pino with the REAL redaction (redactObject), debug level, into a buffer the test scans.
jest.mock('../../src/config/logger', () => {
  const actual = jest.requireActual('../../src/config/logger');
  const pino = jest.requireActual('pino');
  const lines: string[] = [];
  (globalThis as any).__piiLogLines = lines;
  const logger = pino(
    {
      level: 'debug',
      hooks: {
        logMethod(inputArgs: unknown[], method: (...a: unknown[]) => void) {
          if (inputArgs.length >= 2 && typeof inputArgs[0] === 'object' && inputArgs[0] !== null) {
            inputArgs[0] = actual.redactObject(inputArgs[0] as Record<string, unknown>);
          }
          return method.apply(this, inputArgs);
        },
      },
      serializers: { err: pino.stdSerializers.err },
    },
    { write: (s: string) => void lines.push(s) },
  );
  return {
    ...actual,
    logger,
    createRequestLogger: (id: string, extra?: object) => logger.child({ request_id: id, ...extra }),
    resolveRequestId: () => 'r-pii',
  };
});
jest.mock('../../src/services/moderation-ban.service', () => ({
  checkBan: jest.fn(async () => ({ banned: false, retryAfterSecs: 0 })),
  recordBlock: jest.fn(async () => undefined),
}));
jest.mock('../../src/config/mpp.config', () => ({
  getMppConfig: () => ({
    enabled: true,
    privateKey: '0x00',
    usdcAddress: '0x1',
    walletAddress: '0x2',
    secretKey: 's',
    realm: 'r',
    rpcUrl: 'http://rpc',
  }),
}));
jest.mock('../../src/pipeline/stages/tool-status.stage', () => ({
  getToolPriceUsd: () => 1,
  getActiveToolIds: () => new Set<string>(),
}));
jest.mock('../../src/pipeline/pipeline', () => ({ runPipeline: jest.fn() }));
jest.mock('../../src/pipeline/stages/x402-settle', () => ({ settleX402: jest.fn() }));

// Redis: the MPP quote lock only (the nonce store and the counters are injected through ShopDeps).
const kv = new Map<string, string>();
const fakeRedis = {
  set: async (k: string, v: string, _ex: string, _ttl: number, nx: string) => {
    if (nx === 'NX' && kv.has(k)) return null;
    kv.set(k, v);
    return 'OK';
  },
  del: async (k: string) => void kv.delete(k),
};
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => fakeRedis,
  getSharedRedis: () => ({}),
}));

// x402: the header IS the JSON payload; the replay guard is a Set; verify/settle are the spies.
jest.mock('@x402/core/http', () => ({
  decodePaymentSignatureHeader: (h: string) => JSON.parse(h),
  encodePaymentRequiredHeader: () => 'x',
}));
jest.mock('@x402/core/schemas', () => ({
  parsePaymentPayload: (d: unknown) => ({ success: true, data: d }),
}));
const claimed = new Set<string>();
const mockClaim = jest.fn(async (_rail: string, nonce: string) => {
  if (claimed.has(nonce)) return false;
  claimed.add(nonce);
  return true;
});
jest.mock('../../src/services/payment-nonce.service', () => ({
  claimPaymentNonce: (r: string, n: string) => mockClaim(r, n),
}));
const mockVerify = jest.fn();
const mockSettle = jest.fn();
jest.mock('../../src/services/x402-server.service', () => ({
  getSharedResourceServer: () => ({ verifyPayment: mockVerify, settlePayment: mockSettle }),
}));

// MPP: `charge(params)` is the spy; a credentialed call can be held open by `gate` so a second
// credential races it.
const mockCharge = jest.fn();
let handlerCalls = 0;
let gate: Promise<void> | undefined;
const TX_HASH = `0x${'ab'.repeat(32)}`;
const TX_FROM = '0x00000000000000000000000000000000000a11ce';
jest.mock('mppx/server', () => ({
  Store: { redis: () => ({ update: () => undefined }) },
  Mppx: {
    create: () => ({
      charge: (params: unknown) => {
        mockCharge(params);
        return async (req: globalThis.Request) => {
          if (req.headers.get('authorization')) {
            handlerCalls++; // credentialed calls only: a challenge GET settles nothing
            await gate;
            return { status: 200, withReceipt: (r: globalThis.Response) => r };
          }
          return {
            status: 402,
            challenge: {
              headers: new Headers({
                'WWW-Authenticate': `Payment id="ch-1", realm="r", method="tempo", expires="${new Date(Date.now() + 300_000).toISOString()}"`,
              }),
            },
          };
        };
      },
    }),
  },
  tempo: { charge: () => ({}), session: () => ({}) },
}));
jest.mock('viem/accounts', () => {
  const actual = jest.requireActual('viem/accounts');
  return {
    ...actual,
    // the MPP server account is a stub ('0x00'); every real test key goes to viem
    privateKeyToAccount: (k: string) => (k === '0x00' ? {} : actual.privateKeyToAccount(k)),
  };
});
jest.mock('mppx', () => ({ Receipt: { fromResponse: () => ({ reference: TX_HASH }) } }));
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  http: () => ({}),
  createPublicClient: () => ({ getTransaction: async () => ({ from: TX_FROM }) }),
}));

type Row = Record<string, any>;
const E = process['env'];
const PAYOUT = '0x00000000000000000000000000000000000b0b0b';
const PAYOUT_TEMPO = '0x00000000000000000000000000000000000c0c0c';
const PAYER = '0x00000000000000000000000000000000000a11ce';
const NETWORK = 'eip155:8453';
const KEY = 'k'.repeat(40);

// ---------------------------------------------------------------------------------------------
// The BUYER AGENT side, test-only: encrypt to the merchant key. The server has no counterpart of
// any of this (spec 10.1): it never opens an envelope.
// ---------------------------------------------------------------------------------------------
const SPKI = Buffer.from('302a300506032b656e032100', 'hex');
const PKCS8 = Buffer.from('302e020100300506032b656e04220420', 'hex');
const pubKeyOf = (raw: Buffer) =>
  createPublicKey({ key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki' });
const privKeyOf = (raw: Buffer) =>
  createPrivateKey({ key: Buffer.concat([PKCS8, raw]), format: 'der', type: 'pkcs8' });

interface Pair {
  pub: Buffer;
  priv: Buffer;
}
function x25519Pair(): Pair {
  const k = generateKeyPairSync('x25519');
  return {
    pub: Buffer.from(k.publicKey.export({ type: 'spki', format: 'der' })).subarray(-32),
    priv: Buffer.from(k.privateKey.export({ type: 'pkcs8', format: 'der' })).subarray(-32),
  };
}

const i2osp = (n: number, len: number) => {
  const b = Buffer.alloc(len);
  b.writeUIntBE(n, 0, len);
  return b;
};
const KEM_SUITE = Buffer.concat([Buffer.from('KEM'), i2osp(0x0020, 2)]);
const HPKE_SUITE = Buffer.concat([
  Buffer.from('HPKE'),
  i2osp(0x0020, 2),
  i2osp(0x0001, 2),
  i2osp(0x0003, 2),
]);
const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
const lExtract = (suite: Buffer, salt: Buffer, label: string, ikm: Buffer) =>
  hmac(
    salt.length ? salt : Buffer.alloc(32),
    Buffer.concat([Buffer.from('HPKE-v1'), suite, Buffer.from(label), ikm]),
  );
const lExpand = (suite: Buffer, prk: Buffer, label: string, info: Buffer, len: number) =>
  // len <= 32: one HKDF-Expand block
  hmac(
    prk,
    Buffer.concat([
      i2osp(len, 2),
      Buffer.from('HPKE-v1'),
      suite,
      Buffer.from(label),
      info,
      Buffer.from([1]),
    ]),
  ).subarray(0, len);

function hpkeSchedule(dh: Buffer, kemContext: Buffer) {
  const shared = lExpand(
    KEM_SUITE,
    lExtract(KEM_SUITE, Buffer.alloc(0), 'eae_prk', dh),
    'shared_secret',
    kemContext,
    32,
  );
  const ksContext = Buffer.concat([
    Buffer.from([0]),
    lExtract(HPKE_SUITE, Buffer.alloc(0), 'psk_id_hash', Buffer.alloc(0)),
    lExtract(HPKE_SUITE, Buffer.alloc(0), 'info_hash', Buffer.alloc(0)),
  ]);
  const secret = lExtract(HPKE_SUITE, shared, 'secret', Buffer.alloc(0));
  return {
    key: lExpand(HPKE_SUITE, secret, 'key', ksContext, 32),
    nonce: lExpand(HPKE_SUITE, secret, 'base_nonce', ksContext, 12),
  };
}

/** RFC 9180 base mode: DHKEM(X25519, HKDF-SHA256) + HKDF-SHA256 + ChaCha20-Poly1305. enc || ct || tag. */
function hpkeSeal(pubRaw: Buffer, aad: Buffer, pt: Buffer): Buffer {
  const e = x25519Pair();
  const dh = diffieHellman({ privateKey: privKeyOf(e.priv), publicKey: pubKeyOf(pubRaw) });
  const { key, nonce } = hpkeSchedule(dh, Buffer.concat([e.pub, pubRaw]));
  const c = createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  (c as unknown as CipherGCM).setAAD(aad);
  return Buffer.concat([e.pub, c.update(pt), c.final(), c.getAuthTag()]);
}
function hpkeOpen(m: Pair, aad: Buffer, envelope: Buffer): Buffer {
  const enc = envelope.subarray(0, 32);
  const body = envelope.subarray(32);
  const dh = diffieHellman({ privateKey: privKeyOf(m.priv), publicKey: pubKeyOf(enc) });
  const { key, nonce } = hpkeSchedule(dh, Buffer.concat([enc, m.pub]));
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  (d as unknown as DecipherGCM).setAAD(aad);
  d.setAuthTag(body.subarray(-16));
  return Buffer.concat([d.update(body.subarray(0, -16)), d.final()]);
}
/**
 * Sealed-box SHAPE (ephemeral public key || AEAD of the payload): the server only ever sees opaque
 * bytes under `alg: sealed-box-x25519`, so the fixture needs the shape, not libsodium's cipher.
 */
function sealedBoxLike(pubRaw: Buffer, pt: Buffer): Buffer {
  const e = x25519Pair();
  const dh = diffieHellman({ privateKey: privKeyOf(e.priv), publicKey: pubKeyOf(pubRaw) });
  const c = createCipheriv(
    'chacha20-poly1305',
    createHash('sha256').update(dh).digest(),
    Buffer.alloc(12),
    {
      authTagLength: 16,
    },
  );
  return Buffer.concat([e.pub, c.update(pt), c.final(), c.getAuthTag()]);
}

type Alg = 'hpke-x25519-sha256-chacha20' | 'sealed-box-x25519';
const canary = () => `PASSPORT-CANARY-${randomBytes(8).toString('hex')}`;
const passportJson = (marker: string) =>
  JSON.stringify({
    full_name: 'Ada Example',
    passport_number: marker,
    nationality: 'GB',
    dob: '1990-01-01',
    expiry: '2035-01-01',
  });

// everything the test put on the wire as ciphertext or read back as a hash: none of it may be logged
const sentB64: string[] = [];
const seenSha: string[] = [];
const markers: string[] = [];
const logLines: string[] = (globalThis as any).__piiLogLines;

dbDescribe('shop PII is never plaintext (INT-21, wave 2)', () => {
  const prisma = client();
  mockDb.c = prisma;

  const nonces = new Map<string, string>();
  const counters = new Map<string, number>();
  const received: Array<{ headers: Record<string, string>; body: string }> = [];
  const transport: WebhookTransport = async (r) => {
    received.push({ headers: r.headers as Record<string, string>, body: r.body });
    return { status: 200, body: Buffer.from('ok') };
  };
  const deps: ShopDeps & DeliveryDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: {
      set: async (k: string, v: string) => void nonces.set(k, v),
      getdel: async (k: string) => {
        const v = nonces.get(k) ?? null;
        nonces.delete(k);
        return v;
      },
      incr: async (k: string) => {
        counters.set(k, (counters.get(k) ?? 0) + 1);
        return counters.get(k)!;
      },
      expire: async () => 1,
    } as never,
    resolve: async () => ['93.184.216.34'],
    transport,
  };
  const procDeps: ProcessorDeps = {
    queryRaw: (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p),
    executeRaw: (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p),
    redis: () => {
      throw new Error('no redis');
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };

  let srv: Server;
  let base = '';
  beforeAll(async () => {
    migrate();
    await prisma.$executeRawUnsafe(
      `INSERT INTO tools (tool_id, name, provider, category, namespace, status_source, status_reason, status_changed_at)
       VALUES ('shop.order.pay', 'shop.order.pay', 'shop', 'shop', 'shop', 'manual', 'test fixture', now())
       ON CONFLICT DO NOTHING`,
    );
    const app = express();
    app.set('trust proxy', true);
    app.use((req, res, next) => {
      req.requestId = 'r-pii';
      res.setHeader('x-request-id', 'r-pii');
      next();
    });
    app.use(express.json({ limit: '1mb' }));
    app.use(x402Middleware);
    app.use(mppMiddleware);
    app.use(createMcpRouter({ shopDeps: deps }));
    app.use(createMerchantRouter(deps));
    app.use(createOrderRouter(deps));
    app.use(errorHandlerMiddleware);
    srv = await new Promise<Server>((r) => {
      const s = app.listen(0, '127.0.0.1', () => r(s));
    });
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
    await prisma.$disconnect();
  });

  let n = 0;
  const tag = () => `${Date.now().toString(36)}p${n++}`;
  const ip = () =>
    `10.${n % 250}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  beforeEach(() => {
    Object.assign(E, {
      INTEGRATOR_FEE_ENABLED: 'false',
      INTEGRATOR_BASE_ORDERS_ENABLED: 'true',
      MPP_ENABLED: 'true',
      INTEGRATOR_FEE_WALLET: '0x00000000000000000000000000000000000fee00',
      PUBLIC_BASE_URL: 'https://apibase.pro',
    });
    mockVerify.mockReset().mockImplementation(async (p: any) => ({
      isValid: true,
      payer: p.payload.authorization.from,
    }));
    mockSettle.mockReset().mockResolvedValue({ success: true, transaction: '0xabc' });
    mockClaim.mockClear();
    claimed.clear();
    kv.clear();
    clearStorefrontCache();
  });

  const row = async (sql: string, ...v: unknown[]) =>
    (await prisma.$queryRawUnsafe<Row[]>(sql, ...v))[0];
  const rows = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const count = async (sql: string, ...v: unknown[]) => Number((await row(sql, ...v)).c);

  // ---- fixtures: a merchant with a REAL wallet (it signs its encryption key) and a REAL X25519 pair ----
  interface Shop {
    m: string;
    slug: string;
    account: ReturnType<typeof privateKeyToAccount>;
    pair: Pair;
    kid: string;
    skuPassport: string;
    skuAddress: string;
    skuPlain: string;
    apiKey: string;
  }
  const encKey = async (
    account: ReturnType<typeof privateKeyToAccount>,
    kid: string,
    pub: Buffer,
  ) => {
    const k = { kid, alg: 'x25519', pub: pub.toString('base64') };
    return { ...k, sig_by_wallet: await account.signMessage({ message: encryptionKeyMessage(k) }) };
  };
  async function activate(merchant_id: string, wallet: string, key: object) {
    for (const doc_id of ['merchant-agreement', 'aup', 'dpa', 'refund-framework']) {
      const have = await rows(`SELECT 1 FROM shop_legal_docs WHERE doc_id = $1`, doc_id);
      if (have.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO shop_legal_docs (doc_id, version, sha256, url, effective_from, body_md)
           VALUES ($1, 'int21', $2, $3, now() - interval '1 day', 'b')`,
          doc_id,
          doc_id.padEnd(64, '0'),
          `/legal/${doc_id}`,
        );
      }
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_acceptances (merchant_id, doc_id, version, sha256, method, signer, signature, message)
       SELECT DISTINCT ON (doc_id) $1::uuid, doc_id, version, sha256, 'wallet_signature', 's', 'sig', 'm'
         FROM shop_legal_docs WHERE doc_id IN ('merchant-agreement','aup','dpa','refund-framework')
        ORDER BY doc_id, effective_from DESC`,
      merchant_id,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shop_merchants SET status = 'active', payout_wallet_base = $2, payout_wallet_tempo = $3,
              wallet_address = $4, encryption_key = $5::jsonb, created_at = now() - interval '90 days'
        WHERE merchant_id = $1::uuid`,
      merchant_id,
      PAYOUT,
      PAYOUT_TEMPO,
      wallet,
      JSON.stringify(key),
    );
  }
  async function product(merchant_id: string, requires: string[]) {
    const sku = `sku-${tag()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO shop_products (merchant_id, sku, title, price_usd, category, fulfillment_mode,
                                  fulfillment_payload_encrypted, requires_pii)
       VALUES ($1::uuid, $2, 'Tour', 1, 'books', 'instant', $3, $4::text[])`,
      merchant_id,
      sku,
      encryptSecret('booked', KEY),
      requires,
    );
    return sku;
  }
  async function shop(): Promise<Shop> {
    const m = await mkMerchant(prisma, tag());
    const account = privateKeyToAccount(generatePrivateKey());
    const pair = x25519Pair();
    const kid = `kid-${tag()}`;
    await activate(m, account.address.toLowerCase(), await encKey(account, kid, pair.pub));
    const slug = (await row(`SELECT slug FROM shop_merchants WHERE merchant_id = $1::uuid`, m))
      .slug as string;
    return {
      m,
      slug,
      account,
      pair,
      kid,
      skuPassport: await product(m, ['passport']),
      skuAddress: await product(m, ['shipping_address']),
      skuPlain: await product(m, []),
      apiKey: await deps.transaction((tx) => issueKey(tx, m)),
    };
  }

  async function http(
    method: string,
    path: string,
    o: { headers?: Record<string, string>; body?: unknown; key?: string } = {},
  ) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(o.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(o.key ? { authorization: `Bearer ${o.key}` } : {}),
        ...o.headers,
      },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
    const text = await res.text();
    let body: Row = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { status: res.status, body, text };
  }
  const header = (value = toMicroUsdc(1)) =>
    JSON.stringify({
      accepted: { network: NETWORK },
      payload: {
        authorization: {
          from: PAYER,
          to: PAYOUT,
          value,
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 600),
          nonce: `0x${randomBytes(32).toString('hex')}`,
        },
      },
    });
  type Quote = { quote_id: string; order_id: string } & Row;
  async function quote(slug: string, sku: string, who = ip()) {
    const r = await http('POST', '/api/v1/shop/quotes', {
      headers: { 'x-forwarded-for': who },
      body: { merchant: slug, items: [{ sku, qty: 1 }] },
    });
    expect(r.status).toBe(201);
    return { body: r.body as Quote, who };
  }
  const pay = (q: { body: Quote; who: string }, pii?: unknown, withPayment = true) =>
    http('POST', `/api/v1/shop/quotes/${q.body.quote_id}/pay`, {
      headers: { 'x-forwarded-for': q.who, ...(withPayment ? { 'x-payment': header() } : {}) },
      body: pii === undefined ? {} : { pii },
    });

  /** The agent: encrypt `plaintext` to the merchant key listed IN THE QUOTE, AAD = quote_id. */
  function envelope(
    s: Shop,
    q: { body: Quote },
    alg: Alg,
    plaintext: string,
    o: { kid?: string } = {},
  ) {
    const key = q.body.merchant_encryption_key as { kid: string; pub: string };
    const pub = Buffer.from(key.pub, 'base64');
    const ct =
      alg === 'hpke-x25519-sha256-chacha20'
        ? hpkeSeal(pub, Buffer.from(q.body.quote_id), Buffer.from(plaintext))
        : sealedBoxLike(pub, Buffer.from(plaintext));
    const ciphertext_b64 = ct.toString('base64');
    sentB64.push(ciphertext_b64);
    return { kid: o.kid ?? key.kid, alg, ciphertext_b64, _raw: ct, _shop: s };
  }
  const wire = (e: ReturnType<typeof envelope>) => ({
    kid: e.kid,
    alg: e.alg,
    ciphertext_b64: e.ciphertext_b64,
  });
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const orderState = async (id: string) =>
    (await row(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, id)).state as string;
  const envCount = (order_id: string) =>
    count(`SELECT count(*) AS c FROM shop_pii_envelopes WHERE order_id = $1::uuid`, order_id);
  const paymentCount = (order_id: string) =>
    count(`SELECT count(*) AS c FROM shop_payments WHERE order_id = $1::uuid`, order_id);
  const events = async (order_id: string, reason: string) =>
    rows(
      `SELECT payload FROM shop_order_events WHERE order_id = $1::uuid AND reason = $2`,
      order_id,
      reason,
    );

  /** Every row of every shop_* table, as text (`pg_dump --data-only`). */
  function dumpShop(): string {
    return execFileSync(
      process.env['PG_DUMP'] ?? 'pg_dump',
      ['--data-only', '--no-owner', '-t', 'shop_*', process.env['TEST_DATABASE_URL'] as string],
      { maxBuffer: 256 * 1024 * 1024 },
    ).toString('utf8');
  }
  const hex = (s: string) => Buffer.from(s).toString('hex');
  /** The marker is nowhere: not in the response, not in a log line, not in the dump (text or bytea hex). */
  function expectAbsent(marker: string, ...responses: string[]) {
    markers.push(marker);
    for (const r of responses) expect(r).not.toContain(marker);
    expect(logLines.join('\n')).not.toContain(marker);
    const dump = dumpShop();
    expect(dump).not.toContain(marker);
    expect(dump).not.toContain(hex(marker));
  }

  // =========================================================================================
  it('PII-1: plaintext (string, object) in pii.passport -> 400 pii_plaintext_rejected; no order, no marker anywhere', async () => {
    const s = await shop();
    const q = await quote(s.slug, s.skuPassport);
    expect(q.body.requires_pii).toEqual(['passport']);
    expect(q.body.merchant_encryption_key).toMatchObject({ kid: s.kid });
    expect(q.body.merchant_encryption_key.sig_by_wallet).toMatch(/^0x/);

    const m1 = canary();
    const asString = await pay(q, m1);
    expect(asString.status).toBe(400);
    expect(asString.body).toMatchObject({
      error_code: 'pii_plaintext_rejected',
      message: 'encrypt with merchant key, see docs',
      documentation_url: '/integrator#pii',
    });
    const m2 = canary();
    const asObject = await pay(q, { passport: { passport_number: m2 } });
    expect(asObject.status).toBe(400);
    expect(asObject.body.error_code).toBe('pii_plaintext_rejected');
    const m3 = canary();
    const asReadable = await pay(q, { passport: m3 });
    expect(asReadable.status).toBe(400);
    const m4 = canary();
    const extraField = await pay(q, {
      passport: { kid: s.kid, alg: 'sealed-box-x25519', ciphertext_b64: 'AAAA', note: m4 },
    });
    expect(extraField.status).toBe(400);

    // no payment was verified, claimed or settled; the order never left QUOTED; nothing stored
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
    expect(await orderState(q.body.order_id)).toBe('QUOTED');
    expect(await paymentCount(q.body.order_id)).toBe(0);
    expect(await envCount(q.body.order_id)).toBe(0);
    expectAbsent(m1, asString.text);
    expectAbsent(m2, asObject.text);
    expectAbsent(m3, asReadable.text);
    expectAbsent(m4, extraField.text);
  });

  it('PII-1b: the same refusal on /mcp shop.order.pay', async () => {
    const s = await shop();
    const q = await quote(s.slug, s.skuPassport);
    const marker = canary();
    const t = new StreamableHTTPClientTransport(new URL(`${base}/mcp/m/${s.slug}`), {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set('x-payment', header());
        return fetch(input, { ...init, headers: h });
      },
    });
    const c = new Client({ name: 'pii-agent', version: '1' });
    await c.connect(t);
    const r: any = await c.callTool({
      name: 'shop.order.pay',
      arguments: { quote_id: q.body.quote_id, pii: { passport: marker } },
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text).error_code).toBe('pii_plaintext_rejected');
    expect(await orderState(q.body.order_id)).toBe('QUOTED');
    expectAbsent(marker, JSON.stringify(r));
    await c.close();
  });

  it('PII-2: a valid envelope (both algs) -> PAID, one bytea row, matching sha256, marker nowhere', async () => {
    const s = await shop();
    for (const alg of ['hpke-x25519-sha256-chacha20', 'sealed-box-x25519'] as const) {
      const q = await quote(s.slug, s.skuPassport);
      const marker = canary();
      const env = envelope(s, q, alg, passportJson(marker));
      const r = await pay(q, { passport: wire(env) });
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('paid');
      expect(await envCount(q.body.order_id)).toBe(1);
      const stored = await row(
        `SELECT kind, kid, alg, pg_typeof(ciphertext)::text AS t, octet_length(ciphertext) AS n,
                sha256, sha256(ciphertext) AS calc, ciphertext, purge_after, created_at
           FROM shop_pii_envelopes WHERE order_id = $1::uuid`,
        q.body.order_id,
      );
      seenSha.push(stored.sha256);
      expect(stored).toMatchObject({ kind: 'passport', kid: s.kid, alg, t: 'bytea' });
      expect(stored.n).toBe(env._raw.length);
      expect(stored.sha256).toBe(sha(env._raw));
      expect(Buffer.from(stored.calc).toString('hex')).toBe(stored.sha256);
      expect(Buffer.from(stored.ciphertext).equals(env._raw)).toBe(true);
      // passport: created + 30 days
      const days =
        (new Date(stored.purge_after).getTime() - new Date(stored.created_at).getTime()) /
        86_400_000;
      expect(Math.round(days)).toBe(30);

      // the buyer sees kinds + hashes, never the ciphertext
      const got = await http('GET', `/api/v1/shop/orders/${q.body.order_id}`, {
        headers: { 'x-forwarded-for': q.who },
      });
      expect(got.status).toBe(200);
      expect(got.body.pii).toEqual({ kinds: ['passport'], sha256: { passport: stored.sha256 } });
      expect(got.text).not.toContain(env.ciphertext_b64);
      expectAbsent(marker, r.text, got.text);

      if (alg === 'hpke-x25519-sha256-chacha20') {
        // the merchant (and only the merchant) can open it: AAD = quote_id
        const opened = hpkeOpen(
          s.pair,
          Buffer.from(q.body.quote_id),
          Buffer.from(stored.ciphertext),
        );
        expect(JSON.parse(opened.toString()).passport_number).toBe(marker);
      }
    }
    // the boundary: exactly 16 KB is stored
    const q = await quote(s.slug, s.skuPassport);
    const big = Buffer.alloc(16384, 7).toString('base64');
    sentB64.push(big);
    const edge = await pay(q, {
      passport: { kid: s.kid, alg: 'sealed-box-x25519', ciphertext_b64: big },
    });
    expect(edge.status).toBe(200);
  });

  it('PII-3: old kid -> 409 merchant_key_rotated; alg aes-gcm -> 400; 16385 bytes -> 400; no order', async () => {
    const s = await shop();
    const q = await quote(s.slug, s.skuPassport);
    const stale = await pay(q, {
      passport: wire(
        envelope(s, q, 'sealed-box-x25519', passportJson(canary()), { kid: 'old-kid' }),
      ),
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error_code).toBe('merchant_key_rotated');
    expect(stale.body.merchant_encryption_key.kid).toBe(s.kid);
    expect(stale.body.suggested_action).toBe('re-encrypt and pay, or request a new quote');

    const good = wire(envelope(s, q, 'sealed-box-x25519', passportJson(canary())));
    const aes = await pay(q, { passport: { ...good, alg: 'aes-gcm' } });
    expect(aes.status).toBe(400);
    const tooBig = await pay(q, {
      passport: { ...good, ciphertext_b64: Buffer.alloc(16385, 1).toString('base64') },
    });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error_code).toBe('pii_plaintext_rejected');
    for (const r of [stale, aes, tooBig]) expect(r.status).toBeGreaterThanOrEqual(400);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(await orderState(q.body.order_id)).toBe('QUOTED');
    expect(await paymentCount(q.body.order_id)).toBe(0);
    expect(await envCount(q.body.order_id)).toBe(0);
  });

  it('PII-4: pay without pii -> 422 pii_required (+ key with sig_by_wallet); an unrequired kind -> 400', async () => {
    const s = await shop();
    const q = await quote(s.slug, s.skuPassport);
    const missing = await pay(q);
    expect(missing.status).toBe(422);
    expect(missing.body.error_code).toBe('pii_required');
    expect(missing.body.required).toEqual(['passport']);
    expect(missing.body.merchant_encryption_key).toMatchObject({ kid: s.kid });
    expect(missing.body.merchant_encryption_key.sig_by_wallet).toMatch(/^0x[0-9a-f]+$/);
    expect(mockVerify).not.toHaveBeenCalled();

    const e = wire(envelope(s, q, 'sealed-box-x25519', passportJson(canary())));
    const extra = await pay(q, { passport: e, phone: e });
    expect(extra.status).toBe(400);
    expect(extra.body.error_code).toBe('pii_unexpected_kind');
    // a product that needs no PII refuses an envelope too
    const plain = await quote(s.slug, s.skuPlain);
    const unwanted = await pay(plain, { passport: e });
    expect(unwanted.status).toBe(400);
    expect(await orderState(q.body.order_id)).toBe('QUOTED');
    expect(await envCount(q.body.order_id)).toBe(0);
    // the 402 challenge stays reachable without a payment
    const challenge = await pay(q, undefined, false);
    expect(challenge.status).toBe(402);
  });

  it('PII-5: order.paid webhook carries the envelope; GET /orders/:id/pii is tenant-scoped; delivered_to_merchant_at is set once', async () => {
    const s = await shop();
    const other = await shop();
    await setWebhook(deps, s.m, { url: 'https://hook.example/pii', events: ['order.paid'] });

    // (a) webhook first
    const q = await quote(s.slug, s.skuPassport);
    const env = envelope(s, q, 'hpke-x25519-sha256-chacha20', passportJson(canary()));
    expect((await pay(q, { passport: wire(env) })).status).toBe(200);
    const ob = await row(
      `SELECT id, created_at, event_type, payload FROM outbox
        WHERE event_type = 'shop.order.paid' AND payload->>'order_id' = $1`,
      q.body.order_id,
    );
    await processEvent(
      {
        id: BigInt(ob.id),
        created_at: ob.created_at,
        event_type: ob.event_type,
        payload: ob.payload,
      },
      procDeps,
    );
    // the outbox and the delivery row never hold ciphertext
    expect(JSON.stringify(ob.payload)).not.toContain(env.ciphertext_b64);
    received.length = 0;
    expect(
      await deliverDue(deps, { limit: 100, nowMs: Date.now() + 1_000 }),
    ).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(received[0].body);
    expect(body.event).toBe('order.paid');
    expect(body.data.pii).toEqual([
      {
        kind: 'passport',
        kid: s.kid,
        alg: 'hpke-x25519-sha256-chacha20',
        ciphertext_b64: env.ciphertext_b64,
        sha256: sha(env._raw),
      },
    ]);
    const dr = await row(
      `SELECT payload::text AS p FROM shop_webhook_deliveries WHERE outbox_id = $1::bigint LIMIT 1`,
      ob.id,
    );
    expect(dr.p).not.toContain(env.ciphertext_b64);
    const d1 = await row(
      `SELECT delivered_to_merchant_at AS t, purge_after FROM shop_pii_envelopes WHERE order_id = $1::uuid`,
      q.body.order_id,
    );
    expect(d1.t).not.toBeNull();
    // purge_after = min(created + 30d, delivered + 7d) = delivered + 7d
    expect(
      Math.round((new Date(d1.purge_after).getTime() - new Date(d1.t).getTime()) / 86_400_000),
    ).toBe(7);

    // (b) the GET: the same bytes; the merchant's own order only
    const mine = await http('GET', `/api/v1/shop/merchants/me/orders/${q.body.order_id}/pii`, {
      key: s.apiKey,
    });
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual({
      order_id: q.body.order_id,
      envelopes: [
        {
          kind: 'passport',
          kid: s.kid,
          alg: 'hpke-x25519-sha256-chacha20',
          ciphertext_b64: env.ciphertext_b64,
          sha256: sha(env._raw),
        },
      ],
    });
    const foreign = await http('GET', `/api/v1/shop/merchants/me/orders/${q.body.order_id}/pii`, {
      key: other.apiKey,
    });
    expect(foreign.status).toBe(404);
    expect(foreign.text).not.toContain(env.ciphertext_b64);
    const d2 = await row(
      `SELECT delivered_to_merchant_at AS t FROM shop_pii_envelopes WHERE order_id = $1::uuid`,
      q.body.order_id,
    );
    expect(new Date(d2.t).getTime()).toBe(new Date(d1.t).getTime());

    // (c) the GET first on another order starts the clock, once
    const q2 = await quote(s.slug, s.skuPassport);
    expect(
      (
        await pay(q2, {
          passport: wire(envelope(s, q2, 'sealed-box-x25519', passportJson(canary()))),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await row(
          `SELECT delivered_to_merchant_at AS t FROM shop_pii_envelopes WHERE order_id = $1::uuid`,
          q2.body.order_id,
        )
      ).t,
    ).toBeNull();
    const list = await http('GET', '/api/v1/shop/merchants/me/orders', { key: s.apiKey });
    const listed = (list.body.orders as Row[]).find((o) => o.order_id === q2.body.order_id);
    expect(listed?.pii.kinds).toEqual(['passport']);
    expect(list.text).not.toMatch(/ciphertext/);
    expect(
      (
        await http('GET', `/api/v1/shop/merchants/me/orders/${q2.body.order_id}/pii`, {
          key: s.apiKey,
        })
      ).status,
    ).toBe(200);
    const t1 = (
      await row(
        `SELECT delivered_to_merchant_at AS t FROM shop_pii_envelopes WHERE order_id = $1::uuid`,
        q2.body.order_id,
      )
    ).t;
    expect(t1).not.toBeNull();
    await http('GET', `/api/v1/shop/merchants/me/orders/${q2.body.order_id}/pii`, {
      key: s.apiKey,
    });
    const t2 = (
      await row(
        `SELECT delivered_to_merchant_at AS t FROM shop_pii_envelopes WHERE order_id = $1::uuid`,
        q2.body.order_id,
      )
    ).t;
    expect(new Date(t2).getTime()).toBe(new Date(t1).getTime());
    // one "stored temporarily" mail per order
    expect(
      await count(
        `SELECT count(*) AS c FROM email_events WHERE template = 'pii_delivered' AND msg_id = $1`,
        `out:pii:${q2.body.order_id}:pii_delivered`,
      ),
    ).toBe(1);
  });

  it('PII-6: purge by rule (7 days after delivery, 30 days, REFUNDED, address CLOSED + 30), DELETE + pii.purged', async () => {
    const s = await shop();
    const paid = async (sku: string, kind: 'passport' | 'shipping_address') => {
      const q = await quote(s.slug, sku);
      const marker = canary();
      const e = envelope(s, q, 'sealed-box-x25519', passportJson(marker));
      expect((await pay(q, { [kind]: wire(e) })).status).toBe(200);
      return q.body.order_id;
    };
    const sweep = () => runShopSlaSweeper(deps, Date.now());

    // not yet due: fresh, and delivered only 6 days ago
    const fresh = await paid(s.skuPassport, 'passport');
    const six = await paid(s.skuPassport, 'passport');
    await prisma.$executeRawUnsafe(
      `UPDATE shop_pii_envelopes SET delivered_to_merchant_at = now() - interval '6 days' WHERE order_id = $1::uuid`,
      six,
    );
    await sweep();
    expect(await envCount(fresh)).toBe(1);
    expect(await envCount(six)).toBe(1);

    // delivered_to_merchant_at - 8 days
    const delivered = await paid(s.skuPassport, 'passport');
    await prisma.$executeRawUnsafe(
      `UPDATE shop_pii_envelopes SET delivered_to_merchant_at = now() - interval '8 days' WHERE order_id = $1::uuid`,
      delivered,
    );
    // never delivered, created 31 days ago
    const old = await paid(s.skuPassport, 'passport');
    await prisma.$executeRawUnsafe(
      `UPDATE shop_pii_envelopes SET created_at = now() - interval '31 days' WHERE order_id = $1::uuid`,
      old,
    );
    // refunded (INT-23 state mock)
    const refunded = await paid(s.skuPassport, 'passport');
    await prisma.$executeRawUnsafe(
      `UPDATE shop_orders SET state = 'REFUNDED' WHERE order_id = $1::uuid`,
      refunded,
    );
    const res = await sweep();
    expect(res.pii_purged).toBeGreaterThanOrEqual(3);
    for (const id of [delivered, old, refunded]) {
      expect(await envCount(id)).toBe(0);
      expect((await events(id, 'pii.purged')).map((e) => e.payload)).toEqual([
        { kind: 'passport' },
      ]);
    }
    expect(await envCount(fresh)).toBe(1);
    expect(await envCount(six)).toBe(1);

    // address: CLOSED 31 days ago -> gone; CLOSED 29 days ago -> kept
    const closeAt = async (order_id: string, days: number) => {
      await prisma.$executeRawUnsafe(
        `UPDATE shop_orders SET state = 'CLOSED' WHERE order_id = $1::uuid`,
        order_id,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO shop_order_events (order_id, seq, from_state, to_state, actor, reason, at)
         SELECT $1::uuid, COALESCE(MAX(seq), 0) + 1, 'FULFILLED', 'CLOSED', 'system', 'close_after',
                now() - ($2::int * interval '1 day')
           FROM shop_order_events WHERE order_id = $1::uuid`,
        order_id,
        days,
      );
    };
    const a31 = await paid(s.skuAddress, 'shipping_address');
    const a29 = await paid(s.skuAddress, 'shipping_address');
    const open = await paid(s.skuAddress, 'shipping_address');
    expect(
      (await row(`SELECT purge_after FROM shop_pii_envelopes WHERE order_id = $1::uuid`, a31))
        .purge_after,
    ).toBeNull();
    await closeAt(a31, 31);
    await closeAt(a29, 29);
    await sweep();
    expect(await envCount(a31)).toBe(0);
    expect((await events(a31, 'pii.purged')).map((e) => e.payload)).toEqual([
      { kind: 'shipping_address' },
    ]);
    expect(await envCount(a29)).toBe(1);
    expect(await envCount(open)).toBe(1);
  });

  it('PII-7: encryption-key rotation (wallet signature, new kid, undeliverable events + mail, old kid -> 409)', async () => {
    const s = await shop();
    const q0 = await quote(s.slug, s.skuPassport); // open quote made under the old key
    const undelivered = await quote(s.slug, s.skuPassport);
    expect(
      (
        await pay(undelivered, {
          passport: wire(envelope(s, undelivered, 'sealed-box-x25519', passportJson(canary()))),
        })
      ).status,
    ).toBe(200);
    const delivered = await quote(s.slug, s.skuPassport);
    expect(
      (
        await pay(delivered, {
          passport: wire(envelope(s, delivered, 'sealed-box-x25519', passportJson(canary()))),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await http('GET', `/api/v1/shop/merchants/me/orders/${delivered.body.order_id}/pii`, {
          key: s.apiKey,
        })
      ).status,
    ).toBe(200);

    const next = x25519Pair();
    const kid2 = `kid-${tag()}`;
    // signed by somebody else's wallet -> 400, nothing changed
    const stranger = privateKeyToAccount(generatePrivateKey());
    const forged = await http('POST', '/api/v1/shop/merchants/me/keys/rotate', {
      key: s.apiKey,
      body: { encryption_key: await encKey(stranger, kid2, next.pub) },
    });
    expect(forged.status).toBe(400);
    const same = await http('POST', '/api/v1/shop/merchants/me/keys/rotate', {
      key: s.apiKey,
      body: { encryption_key: await encKey(s.account, s.kid, next.pub) },
    });
    expect(same.status).toBe(400);
    expect(
      (
        await row(
          `SELECT encryption_key->>'kid' AS kid FROM shop_merchants WHERE merchant_id = $1::uuid`,
          s.m,
        )
      ).kid,
    ).toBe(s.kid);
    expect(
      await count(
        `SELECT count(*) AS c FROM outbox WHERE event_type = 'shop.merchant.key_rotated' AND payload->>'merchant_id' = $1`,
        s.m,
      ),
    ).toBe(0);

    const ok = await http('POST', '/api/v1/shop/merchants/me/keys/rotate', {
      key: s.apiKey,
      body: { encryption_key: await encKey(s.account, kid2, next.pub) },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.api_key).toMatch(/^mk_live_/);
    expect(
      (
        await row(
          `SELECT encryption_key->>'kid' AS kid FROM shop_merchants WHERE merchant_id = $1::uuid`,
          s.m,
        )
      ).kid,
    ).toBe(kid2);
    expect(
      await count(
        `SELECT count(*) AS c FROM outbox WHERE event_type = 'shop.merchant.key_rotated' AND payload->>'merchant_id' = $1`,
        s.m,
      ),
    ).toBe(1);
    // undelivered envelope: event + one mail; the delivered one: nothing
    expect((await events(undelivered.body.order_id, 'pii.undeliverable')).length).toBe(1);
    expect(
      await count(
        `SELECT count(*) AS c FROM email_events WHERE template = 'pii_undeliverable' AND direction = 'out' AND status = 'queued' AND msg_id = $1`,
        `out:pii:${undelivered.body.order_id}:pii_undeliverable`,
      ),
    ).toBe(1);
    expect((await events(delivered.body.order_id, 'pii.undeliverable')).length).toBe(0);
    expect(
      await count(
        `SELECT count(*) AS c FROM email_events WHERE template = 'pii_undeliverable' AND msg_id = $1`,
        `out:pii:${delivered.body.order_id}:pii_undeliverable`,
      ),
    ).toBe(0);

    // the open quote: paying it with the OLD kid is a 409 carrying the NEW key; with the new kid it pays
    const stale = await pay(q0, {
      passport: wire(envelope(s, q0, 'sealed-box-x25519', passportJson(canary()))),
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error_code).toBe('merchant_key_rotated');
    expect(stale.body.merchant_encryption_key.kid).toBe(kid2);
    expect(await orderState(q0.body.order_id)).toBe('QUOTED');
    const fresh = await quote(s.slug, s.skuPassport);
    expect(fresh.body.merchant_encryption_key.kid).toBe(kid2);
    expect(
      (
        await pay(q0, {
          passport: wire(
            envelope(
              s,
              { body: { ...q0.body, merchant_encryption_key: fresh.body.merchant_encryption_key } },
              'sealed-box-x25519',
              passportJson(canary()),
            ),
          ),
        })
      ).status,
    ).toBe(200);

    // one signature check for registration and rotation
    const reg = readFileSync(join(__dirname, '../../src/shop/merchant.service.ts'), 'utf8');
    const rot = readFileSync(join(__dirname, '../../src/shop/auth/identity.service.ts'), 'utf8');
    expect(reg).toMatch(/await verifyEncryptionKeySignature\(input\.wallet, k\)/);
    expect(rot).toMatch(/await verifyEncryptionKeySignature\(m\.wallet_address, k\)/);
  });

  it('PII-8: no log line of the whole run holds an envelope, a ciphertext hash or a marker; the redaction covers the PII keys', async () => {
    const all = logLines.join('\n');
    expect(logLines.length).toBeGreaterThan(0);
    expect(sentB64.length).toBeGreaterThan(5);
    for (const b of sentB64) expect(all).not.toContain(b);
    expect(seenSha.length).toBeGreaterThan(0);
    for (const h of seenSha) expect(all).not.toContain(h);
    for (const m of markers) expect(all).not.toContain(m);
    // every stored hash (not only the ones this test read)
    for (const r of await rows(`SELECT sha256 FROM shop_pii_envelopes LIMIT 200`)) {
      expect(all).not.toContain(r.sha256);
    }
    const masked = JSON.stringify(
      redactObject({
        pii: { passport: { ciphertext_b64: 'QUJD' } },
        ciphertext_b64: 'QUJD',
        ciphertext: 'QUJD',
        passport_number: 'P1',
        address_line1: 'x',
        shipping_address: { line1: 'x' },
        encryption_key: { pub: 'k' },
      }),
    );
    for (const leaked of ['QUJD"', 'P1', '"x"', '"k"']) expect(masked).not.toContain(leaked);
  });
});
