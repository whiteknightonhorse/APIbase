/** T-INT-29: GET /api/v1/fleet/sea — schema snapshot, staleness, pause, whitelist, rate limit. */
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const store = new Map<string, string>();
jest.mock('../../src/services/redis.service', () => ({
  ensureRedisConnected: async () => ({
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    },
  }),
}));

import { fleetSeaRouter } from '../../src/routes/fleet-sea.router';
import {
  FLEET_SEA_CACHE_KEY,
  FLEET_SEA_KEY,
  serializeFleetSea,
} from '../../src/services/fleet-sea.service';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const iso = (offsetS: number) => new Date(NOW - offsetS * 1000).toISOString();

function stored(over: Record<string, unknown> = {}, ageS = 10) {
  return {
    generated_at: iso(ageS),
    fleet_paused: false,
    ships: [
      { id: 'builder-1', class: 'builder', state: 'working', since_s: 30, activity_level: 3 },
      { id: 'scout-1', class: 'scout', state: 'idle', since_s: 900, activity_level: 1 },
    ],
    external: {
      window_s: 900,
      calls: 7,
      agents_bucket: '1-5',
      by_category: [{ category: 'weather', calls: 7 }],
    },
    honesty: { last_activity_at: iso(30) },
    ...over,
  };
}

async function serve(): Promise<{ server: Server; url: string }> {
  const app = express();
  app.use(fleetSeaRouter);
  const server: Server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  return {
    server,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/fleet/sea`,
  };
}

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

describe('SH1 response schema snapshot (keys and types)', () => {
  it('is fixed', () => {
    const out = serializeFleetSea(stored(), NOW) as unknown as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(
      ['external', 'fleet_paused', 'generated_at', 'honesty', 'ships', 'stale'].sort(),
    );
    expect(typeOf(out.generated_at)).toBe('string');
    expect(typeOf(out.fleet_paused)).toBe('boolean');
    expect(typeOf(out.stale)).toBe('boolean');
    const ship = (out.ships as Array<Record<string, unknown>>)[0];
    expect(Object.keys(ship).sort()).toEqual(['activity_level', 'class', 'id', 'since_s', 'state']);
    expect(ship.id).toBe('builder-1');
    expect(typeOf(ship.since_s)).toBe('number');
    expect(typeOf(ship.activity_level)).toBe('number');
    const ext = out.external as Record<string, unknown>;
    expect(Object.keys(ext).sort()).toEqual(['agents_bucket', 'by_category', 'calls', 'window_s']);
    expect(ext.window_s).toBe(900);
    expect(Object.keys((ext.by_category as Array<object>)[0]).sort()).toEqual([
      'calls',
      'category',
    ]);
    expect(Object.keys(out.honesty as object)).toEqual(['last_activity_at']);
  });
  it('paused adds exactly paused_until_minute', () => {
    const out = serializeFleetSea(
      stored({ fleet_paused: true, paused_until_minute: '2026-10-06T13:00:00Z' }),
      NOW,
    ) as unknown as Record<string, unknown>;
    expect(Object.keys(out)).toContain('paused_until_minute');
    expect(Object.keys(out)).toHaveLength(7);
  });
  it('drops every non-whitelisted field, at any level', () => {
    const dirty = stored({ debug_task_name: 'T-1', secret: 'x' });
    (dirty.ships[0] as Record<string, unknown>).task = 'T-9999';
    (dirty.external as Record<string, unknown>).provider = 'acme';
    const text = JSON.stringify(serializeFleetSea(dirty, NOW));
    for (const s of ['debug_task_name', 'secret', 'T-9999', 'acme']) expect(text).not.toContain(s);
  });
});

describe('SH2 pause', () => {
  it('fleet_paused, ships resting, no reason text', () => {
    const out = serializeFleetSea(
      stored({ fleet_paused: true, paused_until_minute: '2026-10-06T13:00:00Z' }),
      NOW,
    );
    expect(out.fleet_paused).toBe(true);
    expect(out.paused_until_minute).toBe('2026-10-06T13:00:00Z');
    expect(out.ships.every((s) => s.state === 'resting')).toBe(true);
    expect(JSON.stringify(out)).not.toContain('SECRET-REASON-CANARY');
  });
});

describe('SH3 staleness', () => {
  it('121 s old -> stale, nothing working', () => {
    const out = serializeFleetSea(stored({}, 121), NOW);
    expect(out.stale).toBe(true);
    expect(out.ships.some((s) => s.state === 'working')).toBe(false);
  });
  it('60 s old -> fresh, working kept', () => {
    const out = serializeFleetSea(stored({}, 60), NOW);
    expect(out.stale).toBe(false);
    expect(out.ships.some((s) => s.state === 'working')).toBe(true);
  });
  it('missing key -> stale with no ships', () => {
    const out = serializeFleetSea(null, NOW);
    expect(out.stale).toBe(true);
    expect(out.ships).toEqual([]);
  });
});

describe('SH5 forbidden substrings', () => {
  it('response has no internal names, wallets or paths', () => {
    const text = JSON.stringify(serializeFleetSea(stored(), NOW));
    for (const s of ['taskloop', 'night-orchestra', 'autopilot', 'sentinel', '0x', '/home/']) {
      expect(text).not.toContain(s);
    }
  });
});

describe('HTTP route', () => {
  let srv: { server: Server; url: string };
  beforeAll(async () => {
    srv = await serve();
  });
  afterAll(() => new Promise((r) => srv.server.close(() => r(undefined))));
  beforeEach(() => store.clear());

  it('serves from Redis with the cache header, then from the 15 s response cache', async () => {
    store.set(FLEET_SEA_KEY, JSON.stringify(stored({}, 0)));
    const res = await fetch(srv.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=10, s-maxage=10');
    const body = (await res.json()) as { stale: boolean };
    expect(body.stale).toBe(false);
    expect(store.has(FLEET_SEA_CACHE_KEY)).toBe(true);
  });
  it('SH7 the 61st request within a minute is 429', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 61; i++) codes.push((await fetch(srv.url)).status);
    expect(codes.slice(0, 60).every((c) => c === 200 || c === 429)).toBe(true);
    expect(codes[60]).toBe(429);
  });
});
