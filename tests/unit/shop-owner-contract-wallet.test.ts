/** T-INT-45 E8: the read-only owner page opens with a contract-wallet signature (regression ST4). */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { buildSignInMessage, issueNonce } from '../../src/shop/auth/nonce.service';
import type { ShopDeps } from '../../src/shop/merchant-lifecycle.service';
import { createOwnerRouter } from '../../src/shop/routes/owner.router';
import { setSignaturePublicClient } from '../../src/shop/wallet-signature';

jest.mock('../../src/config', () => ({ config: {} }));
jest.mock('../../src/shop/owner.service', () => ({
  ...jest.requireActual('../../src/shop/owner.service'),
  loadOwnerView: async (_d: unknown, m: { slug: string; name: string }) => ({
    merchant: { slug: m.slug, name: m.name, status: 'active', status_reason: null },
    fee: { owed_usd: '0', collected_usd: '0', invoiced_usd: '0', open_invoices: [] },
    orders: [],
    webhook: { endpoints: [], deliveries: 0, success_pct: null, p95_delivery_ms: null },
  }),
}));

const acct = privateKeyToAccount(generatePrivateKey());
const kv = new Map<string, string>();
const redis = {
  set: async (k: string, v: string) => void kv.set(k, v),
  getdel: async (k: string) => {
    const v = kv.get(k) ?? null;
    kv.delete(k);
    return v;
  },
  get: async (k: string) => kv.get(k) ?? null,
};
const deps = {
  redis,
  db: {
    $queryRawUnsafe: async () => [
      {
        merchant_id: 'm-1',
        slug: 'contract-shop',
        name: 'Contract Shop',
        status: 'active',
        status_reason: null,
        wallet_address: acct.address.toLowerCase(),
      },
    ],
  },
} as unknown as ShopDeps;

async function headers(): Promise<Record<string, string>> {
  const nonce = await issueNonce(acct.address, redis as never);
  const message = buildSignInMessage({
    address: acct.address,
    purpose: 'owner',
    nonce,
    issuedAt: new Date().toISOString(),
  });
  return {
    'x-owner-message': Buffer.from(message).toString('base64'),
    'x-owner-signature': await acct.signMessage({ message }),
  };
}

async function get(h: Record<string, string>) {
  const app = express();
  app.use(createOwnerRouter(deps));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const r = await fetch(`http://127.0.0.1:${port}/m/contract-shop/owner`, { headers: h });
    return { status: r.status, body: await r.text() };
  } finally {
    server.close();
  }
}

describe('E8 owner page by contract wallet', () => {
  it('isValidSignature true -> 200, no forms', async () => {
    setSignaturePublicClient({ getCode: async () => '0x6001', verifyMessage: async () => true });
    const r = await get(await headers());
    expect(r.status).toBe(200);
    expect(r.body).not.toMatch(/<form/i);
  });

  it('isValidSignature false -> 401; RPC down -> 503', async () => {
    setSignaturePublicClient({ getCode: async () => '0x6001', verifyMessage: async () => false });
    expect((await get(await headers())).status).toBe(401);
    setSignaturePublicClient({
      getCode: async () => {
        throw new Error('rpc down');
      },
      verifyMessage: async () => true,
    });
    expect((await get(await headers())).status).toBe(503);
  });
});
