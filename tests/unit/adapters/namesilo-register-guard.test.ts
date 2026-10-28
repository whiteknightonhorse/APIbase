jest.mock('../../../src/config/provider-limits.json', () => ({
  namesilo: { limit_type: 'paid', paid_balance: true },
}));
jest.mock('../../../src/services/redis.service', () => ({
  getSharedRedis: () => ({
    async del() {
      return 1;
    },
    async hmset() {
      return 'OK';
    },
    async expire() {
      return 1;
    },
    async setex() {
      return 'OK';
    },
  }),
}));

import { NameSiloAdapter } from '../../../src/adapters/namesilo';
import type { ProviderRequest } from '../../../src/types/provider';

const originalFetch = globalThis.fetch;

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function availability(domain: string, price: number, premium = 0): Response {
  return reply({ reply: { code: 300, available: { domain, price, renew: price, premium } } });
}

function registerReq(params: Record<string, unknown>): ProviderRequest {
  return { toolId: 'namesilo.domain_register', params, requestId: 'req_t0629' };
}

function urls(): string[] {
  return (globalThis.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
}

function registerCalls(): string[] {
  return urls().filter((u) => u.includes('/registerDomain'));
}

describe('NameSiloAdapter domain_register guard (T-0629)', () => {
  const adapter = new NameSiloAdapter('fake-key');

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('refuses years=2 with no upstream call', async () => {
    await expect(adapter.call(registerReq({ domain: 'a.com', years: 2 }))).rejects.toMatchObject({
      httpStatus: 422,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses .io with no upstream call', async () => {
    await expect(adapter.call(registerReq({ domain: 'a.io' }))).rejects.toMatchObject({
      httpStatus: 422,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses a premium domain without registering', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(availability('a.com', 17.29, 1));
    await expect(adapter.call(registerReq({ domain: 'a.com' }))).rejects.toMatchObject({
      httpStatus: 422,
    });
    expect(registerCalls()).toHaveLength(0);
  });

  it('refuses a live price above the cap without registering', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(availability('a.com', 17.7));
    await expect(adapter.call(registerReq({ domain: 'a.com' }))).rejects.toMatchObject({
      httpStatus: 422,
    });
    expect(registerCalls()).toHaveLength(0);
  });

  it('refuses an unavailable domain without registering', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      reply({ reply: { code: 300, unavailable: { domain: 'a.com' } } }),
    );
    await expect(adapter.call(registerReq({ domain: 'a.com' }))).rejects.toMatchObject({
      httpStatus: 422,
    });
    expect(registerCalls()).toHaveLength(0);
  });

  it('passes a non-premium .com at 17.29 through to the register URL', async () => {
    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce(availability('a.com', 17.29))
      .mockResolvedValueOnce(reply({ reply: { code: 300, detail: 'success', domain: 'a.com' } }));
    const raw = await adapter.call(registerReq({ domain: 'A.com' }));
    expect(JSON.stringify(raw.body)).toContain('"success":true');
    expect(registerCalls()).toHaveLength(1);
    expect(registerCalls()[0]).toContain('years=1');
  });
});
