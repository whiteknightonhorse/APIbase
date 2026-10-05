/**
 * T-INT-14 WH1-WH10: merchant webhooks (F-6) against a real Postgres (TEST_DATABASE_URL, disposable)
 * and a local mock receiver. The HTTP transport and DNS are injected: the receiver is plain HTTP on
 * 127.0.0.1, the hostnames are mapped by a mock resolver (nothing leaves the machine).
 */
import { createHmac, randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { HANDLED_EVENT_TYPES, processEvent, type ProcessorDeps } from '../../src/outbox/processor';
import { issueKey } from '../../src/shop/auth/merchant-key.service';
import { registerMerchantTools } from '../../src/shop/tools/merchant.tools';
import { RETRY_DELAYS_MS } from '../../src/shop/webhook/constants';
import { deliverDue, redeliver, type DeliveryDeps } from '../../src/shop/webhook/delivery.service';
import type { WebhookTransport } from '../../src/shop/webhook/transport';
import { listEvents, setWebhook } from '../../src/shop/webhook/webhook.service';
import { client, dbDescribe, migrate, mkMerchant, mkOrder, mkQuote } from './helpers/shop-db';

jest.mock('../../src/config/index', () => ({
  config: { ENCRYPTION_KEY: 'k'.repeat(40), X402_NETWORK: 'base' },
}));
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Row = Record<string, any>;

interface Hit {
  headers: http.IncomingHttpHeaders;
  body: string;
}

dbDescribe('merchant webhooks (F-6)', () => {
  const prisma = client();
  const resolveMap: Record<string, string[]> = {
    'hook.example': ['93.184.216.34'],
    'rebind.example': ['127.0.0.1'],
  };
  let reply: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  let hits: Hit[] = [];
  let server: http.Server;
  let port = 0;

  // the pinned IP is ignored here: the mock receiver lives on 127.0.0.1
  const transport: WebhookTransport = (r) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/hook', method: 'POST', headers: r.headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }),
          );
        },
      );
      req.on('error', reject);
      req.end(r.body);
    });

  const deps: DeliveryDeps = {
    db: prisma as never,
    transaction: (fn) => prisma.$transaction((tx) => fn(tx as never)),
    redis: { incr: async () => 1, expire: async () => 1 } as never,
    resolve: async (h) => {
      if (!resolveMap[h]) throw new Error('NXDOMAIN');
      return resolveMap[h];
    },
    transport,
  };
  // +1 s: the row's next_attempt_at is the DB clock (microseconds), this one is JS (ms)
  const run = () => deliverDue(deps, { limit: 100, nowMs: Date.now() + 1000 });
  const q = (sql: string, ...v: unknown[]) => prisma.$queryRawUnsafe<Row[]>(sql, ...v);
  const x = (sql: string, ...v: unknown[]) => prisma.$executeRawUnsafe(sql, ...v);
  const procDeps: ProcessorDeps = {
    queryRaw: (sql, ...p) => prisma.$queryRawUnsafe(sql, ...p),
    executeRaw: (sql, ...p) => prisma.$executeRawUnsafe(sql, ...p),
    redis: () => {
      throw new Error('no redis');
    },
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
  let n = 0;
  const tag = () => `${Date.now().toString(36)}w${n++}`;

  beforeAll(async () => {
    migrate();
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        hits.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        reply(req, res);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    // the DB is shared across runs: earlier leftovers must not crowd out this test's claims
    await x(`DELETE FROM shop_webhook_deliveries`);
    hits = [];
    reply = (_q, res) => res.writeHead(200).end('ok');
  });

  async function merchant() {
    const m = await mkMerchant(prisma, tag());
    await x(`UPDATE shop_merchants SET status = 'active' WHERE merchant_id = $1::uuid`, m);
    return m;
  }
  async function endpoint(m: string, events = ['order.paid']) {
    const r = await setWebhook(deps, m, { url: 'https://hook.example/hook', events });
    return { id: r.endpoint_id, secret: r.secret as string };
  }
  /** An outbox event of `type` for merchant m, run through the real processEvent. */
  async function emit(type: string, payload: Row) {
    const rows = await q(
      `INSERT INTO outbox (event_type, payload) VALUES ($1, $2::jsonb) RETURNING id, created_at`,
      type,
      JSON.stringify(payload),
    );
    const ev = {
      id: BigInt(rows[0].id),
      created_at: rows[0].created_at,
      event_type: type,
      payload,
    };
    expect(await processEvent(ev, procDeps)).toBe(true);
    return String(rows[0].id);
  }
  async function paidOrder(m: string, state = 'PAID') {
    return mkOrder(prisma, m, await mkQuote(prisma, m, { status: 'paid' }), state);
  }
  const deliveries = (endpoint_id: string) =>
    q(
      `SELECT * FROM shop_webhook_deliveries WHERE endpoint_id = $1::uuid ORDER BY attempt, created_at`,
      endpoint_id,
    );
  const verify = (secret: string, h: Hit) => {
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(h.headers['x-apibase-signature']));
    if (!m) return false;
    return createHmac('sha256', secret).update(`${m[1]}.${h.body}`).digest('hex') === m[2];
  };

  it('WH1: the signature t,v1 verifies by the formula; one changed byte of the body breaks it', async () => {
    const m = await merchant();
    const ep = await endpoint(m);
    const outbox_id = await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m });
    expect(await run()).toBeGreaterThanOrEqual(1);
    const h = hits[hits.length - 1];
    expect(h.headers['x-apibase-event']).toBe('order.paid');
    expect(h.headers['x-apibase-delivery-id']).toBe(outbox_id);
    expect(h.headers['content-type']).toBe('application/json');
    expect(verify(ep.secret, h)).toBe(true);
    const flipped = { ...h, body: h.body.replace('order.paid', 'order.pail') };
    expect(flipped.body).not.toBe(h.body);
    expect(verify(ep.secret, flipped)).toBe(false);
    expect(verify('whsec_wrong', h)).toBe(false);
    expect((await deliveries(ep.id))[0]).toMatchObject({ status: 'delivered', status_code: 200 });
  });

  it('WH2: http://, RFC1918, metadata IP, a name resolving to 127.0.0.1 are 422; a 302 is a refusal', async () => {
    const m = await merchant();
    for (const url of [
      'http://hook.example/hook',
      'https://10.0.0.1/',
      'https://192.168.1.5/x',
      'https://169.254.169.254/latest/meta-data',
      'https://127.0.0.1/',
      'https://[::1]/',
      'https://[::ffff:127.0.0.1]/',
      'https://rebind.example/hook',
      'https://nxdomain.example/',
    ]) {
      await expect(setWebhook(deps, m, { url, events: ['order.paid'] })).rejects.toMatchObject({
        status: 422,
      });
    }
    expect(
      (await q(`SELECT 1 FROM shop_webhook_endpoints WHERE merchant_id = $1::uuid`, m)).length,
    ).toBe(0);

    // DNS rebinding after registration: delivery re-resolves and refuses a non-public answer
    const ep = await endpoint(m);
    resolveMap['hook.example'] = ['10.1.2.3'];
    try {
      await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m });
      await run();
    } finally {
      resolveMap['hook.example'] = ['93.184.216.34'];
    }
    expect(hits.length).toBe(0);
    expect((await deliveries(ep.id))[0].status).toBe('retry');

    // a redirect is not followed: the receiver sees one request, the answer is a failure
    const m2 = await merchant();
    const ep2 = await endpoint(m2);
    reply = (_q, res) => res.writeHead(302, { Location: 'https://169.254.169.254/' }).end();
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m2 });
    await run();
    const rows = await deliveries(ep2.id);
    expect(hits.length).toBe(1);
    expect(rows[0]).toMatchObject({ status: 'retry', status_code: 302, delivered_at: null });
  });

  it('WH3: failures retry at +1m,+5m,+30m,+2h,+12h,+24h; the 7th failure is final', async () => {
    const m = await merchant();
    const ep = await endpoint(m);
    reply = (_q, res) => res.writeHead(500).end('boom');
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m });
    let now = Date.now() + 1000;
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      expect(await deliverDue(deps, { limit: 100, nowMs: now })).toBeGreaterThanOrEqual(1);
      const rows = await deliveries(ep.id);
      expect(rows.length).toBe(i + 2);
      const next = rows[rows.length - 1];
      expect(next).toMatchObject({ attempt: i + 2, status: 'pending' });
      expect(new Date(next.next_attempt_at).getTime()).toBe(now + RETRY_DELAYS_MS[i]);
      now += RETRY_DELAYS_MS[i];
    }
    expect(RETRY_DELAYS_MS).toEqual([60e3, 300e3, 1800e3, 7200e3, 43200e3, 86400e3]);
    await deliverDue(deps, { limit: 100, nowMs: now });
    const rows = await deliveries(ep.id);
    expect(rows.length).toBe(7); // no 8th attempt
    expect(rows[6]).toMatchObject({ attempt: 7, status: 'failed', next_attempt_at: null });
    expect(rows.slice(0, 6).every((r) => r.status === 'retry')).toBe(true);
    expect(await deliverDue(deps, { limit: 100, nowMs: now + 1e9 })).toBe(0);
    const e = await q(
      `SELECT failures_in_row FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`,
      ep.id,
    );
    expect(e[0].failures_in_row).toBe(7);
  });

  it('WH4: 10 failures in a row -> a new delivery waits for the schedule; a 2xx resets the counter', async () => {
    const m = await merchant();
    const ep = await endpoint(m);
    await x(
      `UPDATE shop_webhook_endpoints SET failures_in_row = 10 WHERE endpoint_id = $1::uuid`,
      ep.id,
    );
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m });
    const r1 = (await deliveries(ep.id))[0];
    expect(new Date(r1.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect(await run()).toBe(0); // not immediate

    // on the schedule it is tried; success closes the breaker
    expect(await deliverDue(deps, { limit: 100, nowMs: Date.now() + 120_000 })).toBe(1);
    const e = await q(
      `SELECT failures_in_row FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`,
      ep.id,
    );
    expect(e[0].failures_in_row).toBe(0);
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m });
    const last = (await deliveries(ep.id)).pop() as Row;
    expect(new Date(last.next_attempt_at).getTime()).toBeLessThan(Date.now() + 5_000);
  });

  it('WH5: {fulfillment} on the first delivery -> FULFILLED; a redelivery with another one is ignored', async () => {
    const m = await merchant();
    const ep = await endpoint(m);
    const order_id = await paidOrder(m);
    reply = (_q, res) => res.writeHead(200).end(JSON.stringify({ fulfillment: 'KEY-FIRST' }));
    const outbox_id = await emit('shop.order.paid', { order_id, merchant_id: m });
    await run();
    let rows = await deliveries(ep.id);
    expect(rows[0]).toMatchObject({ status: 'delivered', fulfillment_accepted: true });
    expect(rows[0].response_excerpt).not.toContain('KEY-FIRST');
    const o = (await q(`SELECT state FROM shop_orders WHERE order_id = $1::uuid`, order_id))[0];
    expect(o.state).toBe('FULFILLED');
    const events = await q(
      `SELECT to_state FROM shop_order_events WHERE order_id = $1::uuid ORDER BY seq`,
      order_id,
    );
    expect(events.map((e) => e.to_state)).toEqual(['CONFIRMED', 'FULFILLED']);

    reply = (_q, res) => res.writeHead(200).end(JSON.stringify({ fulfillment: 'KEY-SECOND' }));
    expect(await redeliver(deps, rows[0].delivery_id, Date.now())).toBe(true);
    await run();
    rows = await deliveries(ep.id);
    expect(rows.length).toBe(2);
    expect(rows[1]).toMatchObject({ attempt: 2, status: 'delivered', fulfillment_accepted: false });
    expect(hits.map((h) => h.headers['x-apibase-delivery-id'])).toEqual([outbox_id, outbox_id]);
    expect(JSON.parse(hits[1].body).data.order_id).toBe(order_id);
    const enc = (
      await q(
        `SELECT fulfillment_payload_enc AS f FROM shop_orders WHERE order_id = $1::uuid`,
        order_id,
      )
    )[0].f;
    expect(enc).toBeTruthy();
    const { decryptSecret } = await import('../../src/services/secret-crypto.service');
    expect(decryptSecret(enc, 'k'.repeat(40))).toBe('KEY-FIRST');
  });

  it('WH5b: an invalid or oversized fulfillment is not taken (delivery still counts as delivered)', async () => {
    const m = await merchant();
    const ep = await endpoint(m);
    const o1 = await paidOrder(m);
    reply = (_q, res) =>
      res.writeHead(200).end(JSON.stringify({ fulfillment: 'x'.repeat(16 * 1024 + 1) }));
    await emit('shop.order.paid', { order_id: o1, merchant_id: m });
    reply = (_q, res) => res.writeHead(200).end(JSON.stringify({ fulfillment: 42 }));
    const o2 = await paidOrder(m);
    await emit('shop.order.paid', { order_id: o2, merchant_id: m });
    reply = (_q, res) => res.writeHead(202).end(JSON.stringify({ fulfillment: 'ONLY-ON-200' }));
    const o3 = await paidOrder(m);
    await emit('shop.order.paid', { order_id: o3, merchant_id: m });
    await run();
    // all three are answered with the reply set last (the mock is shared), so check by state only
    const states = await q(`SELECT state FROM shop_orders WHERE order_id = ANY($1::uuid[])`, [
      o1,
      o2,
      o3,
    ]);
    expect(states.every((s) => s.state === 'PAID')).toBe(true);
    expect(
      (await deliveries(ep.id)).every((d) => d.status === 'delivered' && !d.fulfillment_accepted),
    ).toBe(true);
  });

  it("WH6: events?since= is monotonic and shows only the key owner's events", async () => {
    const a = await merchant();
    const b = await merchant();
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: a });
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: b });
    await emit('shop.refund.overdue', { order_id: randomUUID(), merchant_id: a });
    await emit('shop.order.confirmed', { order_id: randomUUID(), merchant_id: a });
    const p1 = await listEvents(deps, a, { limit: 2 });
    expect(p1.events.map((e) => e.event)).toEqual(['order.paid', 'refund.overdue']);
    const p2 = await listEvents(deps, a, { since: p1.next_cursor });
    expect(p2.events.map((e) => e.event)).toEqual(['order.confirmed']);
    const ids = [...p1.events, ...p2.events].map((e) => BigInt(e.id));
    expect(ids).toEqual([...ids].sort((u, v) => (u < v ? -1 : 1)));
    const p3 = await listEvents(deps, a, { since: p2.next_cursor });
    expect(p3.events).toEqual([]);
    expect(p3.next_cursor).toBe(p2.next_cursor);
    expect((await listEvents(deps, b, {})).events.length).toBe(1);
    await expect(listEvents(deps, a, { since: 'abc' })).rejects.toMatchObject({ status: 422 });
  });

  it('WH7: HANDLED_EVENT_TYPES has shop.order.paid and no money type', () => {
    expect(HANDLED_EVENT_TYPES).toContain('shop.order.paid');
    expect(HANDLED_EVENT_TYPES).not.toContain('mpp_refund_owed');
    expect(HANDLED_EVENT_TYPES).not.toContain('x402_settle_failed');
    expect(HANDLED_EVENT_TYPES.filter((t) => !t.startsWith('shop.'))).toEqual([
      'cache_invalidate',
      'TOOL_CONFIG_UPDATED',
      'form_submission',
    ]);
  });

  it('WH8: response_excerpt is cut to 1 KB; only secret_hash + an encrypted copy are stored', async () => {
    const m = await merchant();
    const ep = await endpoint(m);
    reply = (_q, res) => res.writeHead(500).end('é'.repeat(5000));
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m });
    await run();
    const d = (await deliveries(ep.id))[0];
    expect(Buffer.byteLength(d.response_excerpt)).toBeLessThanOrEqual(1024);
    expect(d.response_excerpt.length).toBeGreaterThan(400);
    const row = (
      await q(`SELECT * FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`, ep.id)
    )[0];
    expect(ep.secret).toMatch(/^whsec_[0-9a-f]{32}$/);
    expect(row.secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(ep.secret);
    expect(JSON.stringify(row)).not.toContain(ep.secret.slice(6));
    const dump = await q(
      `SELECT row_to_json(d)::text AS t FROM shop_webhook_deliveries d WHERE endpoint_id = $1::uuid`,
      ep.id,
    );
    expect(dump[0].t).not.toContain(ep.secret);
  });

  it('WH9: a receiver that answers after 11 s is a failure after 10 s', async () => {
    const m = await merchant();
    const ep = await endpoint(m);
    reply = (_q, res) => {
      setTimeout(() => res.writeHead(200).end('late'), 11_000).unref();
    };
    await emit('shop.order.paid', { order_id: randomUUID(), merchant_id: m });
    const t0 = Date.now();
    await run();
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(9_900);
    expect(took).toBeLessThan(10_900);
    const d = (await deliveries(ep.id))[0];
    expect(d.status).toBe('retry');
    expect(d.response_excerpt).toMatch(/timeout/);
  }, 20_000);

  it("WH10: webhook_set with another merchant's endpoint_id is 404 (service and MCP tool); scope enforced", async () => {
    const a = await merchant();
    const b = await merchant();
    const epB = await endpoint(b);
    await expect(
      setWebhook(deps, a, {
        url: 'https://hook.example/x',
        events: ['order.paid'],
        endpoint_id: epB.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await q(`SELECT url FROM shop_webhook_endpoints WHERE endpoint_id = $1::uuid`, epB.id))[0]
        .url,
    ).toBe('https://hook.example/hook');

    const connect = async (apiKey: string) => {
      const srv = new McpServer({ name: 't', version: '0' });
      registerMerchantTools(srv, apiKey, 'req-1', deps);
      const c = new Client({ name: 'c', version: '0' });
      const [t1, t2] = InMemoryTransport.createLinkedPair();
      await Promise.all([srv.connect(t1), c.connect(t2)]);
      return async (args: Row) => {
        const r: any = await c.callTool({ name: 'shop.merchant.webhook_set', arguments: args });
        return { isError: !!r.isError, body: JSON.parse(r.content[0].text) };
      };
    };
    const keyA = await deps.transaction((tx) => issueKey(tx, a));
    const call = await connect(keyA);
    const bad = await call({
      url: 'https://hook.example/x',
      events: ['order.paid'],
      endpoint_id: epB.id,
    });
    expect(bad.isError).toBe(true);
    expect(bad.body.error_code).toBe('not_found');
    const good = await call({
      url: 'https://hook.example/x',
      events: ['order.paid', 'refund.requested'],
    });
    expect(good.body.secret).toMatch(/^whsec_/);
    const again = await call({
      url: 'https://hook.example/y',
      events: ['order.paid'],
      endpoint_id: good.body.endpoint_id,
    });
    expect(again.body.secret).toBeUndefined();
    const ro = await connect(await deps.transaction((tx) => issueKey(tx, a, ['orders:read'])));
    expect((await ro({ url: 'https://hook.example/x', events: ['order.paid'] })).isError).toBe(
      true,
    );
    const bogus = await call({ url: 'https://hook.example/x', events: ['order.exploded'] });
    expect(bogus.isError).toBe(true);
  });
});
