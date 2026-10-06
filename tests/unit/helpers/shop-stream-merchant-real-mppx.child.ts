/**
 * T-INT-46 attempt 2, MS1-real (child process of shop-stream-merchant-real-mppx.test.ts).
 * mppx is ESM-only and jest here is CJS, so the REAL `mppx/server` factory runs in a tsx process.
 * Faked: the chain RPC (a local JSON-RPC HTTP server behind `rpcUrl`), the Redis store, the MPP
 * config. Real: mppx/server, mppx/tempo, viem, the stream router, Postgres (TEST_DATABASE_URL).
 * Prints `RESULT<json>`.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { encodeFunctionResult, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

process.env.ENCRYPTION_KEY = 'k'.repeat(40);
process.env.MPP_ENABLED = 'true';
process.env.MPP_TESTNET = 'true';
process.env.MPP_SECRET_KEY = 'real-factory-hmac';
process.env.TEMPO_WALLET_ADDRESS = '0x0000000000000000000000000000000000000002';
process.env.TEMPO_PRIVATE_KEY = `0x${'11'.repeat(32)}`;
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:55447';
const KEY = process.env.ENCRYPTION_KEY;
const TOKEN = '0x20c0000000000000000000000000000000000000';
const MERCHANT = privateKeyToAccount(generatePrivateKey());
const PAYER = privateKeyToAccount(generatePrivateKey());
const RATE = '0.0001';
const UNIT_MICRO = 6000n;
const mem = new Map<string, string>();
const rpcMethods: string[] = [];

async function main(): Promise<Record<string, unknown>> {
  const { Challenge, Credential } = await import('mppx');
  const { Session } = (await import('mppx/tempo')) as any;
  const escrowAbi = await loadEscrowAbi();

  // fake chain RPC: the testnet RPC URL is answered in-process by overriding global fetch
  const realFetch = globalThis.fetch;
  const answer = (m: { id: number; method: string }) => {
    rpcMethods.push(m.method);
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
    switch (m.method) {
      case 'eth_chainId':
        return ok('0xa5bf');
      case 'eth_call':
        return ok(
          encodeFunctionResult({
            abi: escrowAbi as never,
            functionName: 'getChannel',
            result: {
              finalized: false,
              closeRequestedAt: 0n,
              payer: PAYER.address,
              payee: MERCHANT.address,
              token: TOKEN,
              authorizedSigner: PAYER.address,
              deposit: 1_000_000n,
              settled: 0n,
            },
          } as never),
        );
      case 'eth_getTransactionCount':
        return ok('0x1');
      case 'eth_estimateGas':
        return ok('0x30d40');
      case 'eth_gasPrice':
      case 'eth_maxPriorityFeePerGas':
        return ok('0x3b9aca00');
      case 'eth_getBlockByNumber':
        return ok({
          number: '0x1',
          hash: `0x${'0'.repeat(64)}`,
          baseFeePerGas: '0x3b9aca00',
          timestamp: '0x1',
          transactions: [],
        });
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: m.method } };
    }
  };
  globalThis.fetch = (async (input: any, init?: any) => {
    const u = typeof input === 'string' ? input : (input.url ?? String(input));
    if (!u.startsWith('https://rpc.moderato.tempo.xyz')) return realFetch(input, init);
    const parsed = JSON.parse(init?.body ?? (await input.text()));
    const out = Array.isArray(parsed) ? parsed.map(answer) : answer(parsed);
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const { createStreamRouter } = require('../../../src/shop/routes/stream.router');
  const { getStreamMethod } = require('../../../src/shop/stream-session');
  const { encryptSecret } = require('../../../src/services/secret-crypto.service');

  const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const deps = {
    db: prisma,
    transaction: (fn: (tx: unknown) => Promise<unknown>) => prisma.$transaction((tx) => fn(tx)),
  };
  const app = express();
  app.use(express.json());
  app.use(createStreamRouter({ deps, limit: 100000 }));
  const api: Server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

  const tag = Date.now().toString(36);
  const [{ merchant_id: merchantId }] = await prisma.$queryRawUnsafe<{ merchant_id: string }[]>(
    `INSERT INTO shop_merchants (slug, name, category, country, wallet_address, payout_wallet_base,
        payout_wallet_tempo, contact_email, site_url, status, stream_settler)
     VALUES ($1, 'm', 'c', 'US', $2, '0xb', $3, 'a@b.c', 'https://x.example', 'active', 'merchant')
     RETURNING merchant_id`,
    `m-${tag}`,
    `0x${tag}`,
    MERCHANT.address,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO shop_products (merchant_id, sku, title, price_usd, fulfillment_mode, stream,
                                fulfillment_payload_encrypted, category)
     VALUES ($1::uuid, 'demo-stream', 'Stream', $2::numeric, 'stream', $3::jsonb, $4, 'digital-goods')`,
    merchantId,
    RATE,
    JSON.stringify({
      rate_per_s_usd: RATE,
      min_deposit_usd: '1',
      unit: 'second',
      content_ref: 'c',
    }),
    encryptSecret('abc', KEY),
  );
  const url = `${base}/api/v1/shop/m/m-${tag}/stream/demo-stream?seconds=60`;
  const out: Record<string, unknown> = {};

  // 1. a real challenge
  const first = await fetch(url);
  out.challengeStatus = first.status;
  const challenge = Challenge.deserialize(first.headers.get('www-authenticate')!);
  const md = (challenge.request as any).methodDetails;
  const escrow = md.escrowContract as Hex;

  // 2. a channel the payer opened: in the mppx store, in the session table
  const channelId = `0x${randomBytes(32).toString('hex')}` as Hex;
  const method = await getStreamMethod(
    {
      merchant_id: merchantId,
      slug: `m-${tag}`,
      payout_wallet_tempo: MERCHANT.address,
      stream_settler: 'merchant',
    },
    { rate_per_s_usd: RATE, min_deposit_usd: '1' },
  );
  await method.channels.updateChannel(channelId, () => ({
    authorizedSigner: PAYER.address,
    chainId: md.chainId,
    escrowContract: escrow,
    channelId,
    closeRequestedAt: 0n,
    createdAt: new Date().toISOString(),
    deposit: 1_000_000n,
    finalized: false,
    highestVoucher: null,
    highestVoucherAmount: 0n,
    payee: MERCHANT.address,
    payer: PAYER.address,
    settledOnChain: 0n,
    spent: 0n,
    token: TOKEN,
    units: 0,
  }));
  await prisma.$executeRawUnsafe(
    `INSERT INTO shop_stream_sessions
       (merchant_id, sku, buyer_agent_id, channel_id, deposit_usd, rate_per_s, settler_mode,
        escrow_contract, chain_id, opened_at, status)
     VALUES ($1::uuid, 'demo-stream', $2, $3, 1, $4::numeric, 'merchant', $5, $6, now(), 'open')`,
    merchantId,
    PAYER.address,
    channelId,
    RATE,
    escrow,
    md.chainId,
  );

  // 3. the payer's close voucher, signed for real
  const cumulative = 3n * UNIT_MICRO;
  const signature = await Session.Voucher.signVoucher(
    {} as never,
    PAYER,
    { channelId, cumulativeAmount: cumulative },
    escrow,
    md.chainId,
  );
  const authorization = Credential.serialize(
    Credential.from({
      challenge,
      payload: { action: 'close', channelId, cumulativeAmount: cumulative.toString(), signature },
    } as never),
  );
  const close = await fetch(url, { headers: { authorization } });
  out.closeStatus = close.status;
  out.closeBody = await close.json().catch(() => null);
  out.rpcMethods = rpcMethods;
  out.channelId = channelId;
  out.cumulative = cumulative.toString();
  out.signature = signature;
  out.session = (
    await prisma.$queryRawUnsafe<any[]>(
      `SELECT status, highest_voucher FROM shop_stream_sessions WHERE channel_id = $1`,
      channelId,
    )
  )[0];
  await prisma.$disconnect();
  api.close();
  return out;
}

/** The escrow ABI file of the vendored mppx (the package does not export it). */
async function loadEscrowAbi(): Promise<unknown> {
  const file = require('node:path').resolve(
    __dirname,
    '../../../node_modules/mppx/dist/tempo/session/escrow.abi.js',
  );
  return (await import(file)).escrowAbi;
}

main().then(
  (out) => {
    console.log('RESULT' + JSON.stringify(out));
    process.exit(0);
  },
  (e) => {
    console.log('RESULT' + JSON.stringify({ crashed: String((e && e.stack) || e) }));
    process.exit(0);
  },
);
