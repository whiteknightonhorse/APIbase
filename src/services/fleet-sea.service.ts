import { ensureRedisConnected } from './redis.service';

/**
 * T-INT-29: public "sea fleet" view. The exporter (scripts/sea-fleet-export.py) writes the
 * aggregate to Redis `fleet:sea`; this service only validates, freshens and serializes it.
 * Every output field goes through an explicit whitelist pick — anything else is dropped.
 */
export const FLEET_SEA_KEY = 'fleet:sea';
export const FLEET_SEA_CACHE_KEY = 'fleet:sea:resp';
export const FLEET_SEA_CACHE_TTL_S = 15;
export const FLEET_SEA_STALE_AFTER_S = 120;

const CLASSES = ['builder', 'scout', 'medic', 'writer', 'watch'] as const;
const STATES = ['working', 'idle', 'resting'] as const;
const BUCKETS = ['0', '1-5', '6-20', '21+'] as const;

export interface FleetSeaShip {
  id: string;
  class: (typeof CLASSES)[number];
  state: (typeof STATES)[number];
  since_s: number;
  activity_level: number;
}

export interface FleetSeaResponse {
  generated_at: string | null;
  fleet_paused: boolean;
  paused_until_minute?: string;
  stale: boolean;
  ships: FleetSeaShip[];
  external: {
    window_s: number;
    calls: number;
    agents_bucket: (typeof BUCKETS)[number];
    by_category: Array<{ category: string; calls: number }>;
  };
  honesty: { last_activity_at: string | null };
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(0, Math.floor(v)), max) : 0;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  return list.includes(v as T) ? (v as T) : fallback;
}

function pickShip(raw: unknown): FleetSeaShip | null {
  if (!isObj(raw) || !CLASSES.includes(raw.class as FleetSeaShip['class'])) return null;
  return {
    id: String(str(raw.id) ?? '').slice(0, 32),
    class: raw.class as FleetSeaShip['class'],
    state: oneOf(STATES, raw.state, 'idle'),
    since_s: num(raw.since_s),
    activity_level: num(raw.activity_level, 3),
  };
}

/** Pure: raw stored aggregate (or null) + clock -> the public response. */
export function serializeFleetSea(raw: unknown, nowMs: number): FleetSeaResponse {
  const r: Raw = isObj(raw) ? raw : {};
  const ext: Raw = isObj(r.external) ? r.external : {};
  const hon: Raw = isObj(r.honesty) ? r.honesty : {};
  const generatedAt = str(r.generated_at);
  const genMs = generatedAt === null ? NaN : Date.parse(generatedAt);
  const stale = !Number.isFinite(genMs) || (nowMs - genMs) / 1000 > FLEET_SEA_STALE_AFTER_S;
  const paused = !stale && r.fleet_paused === true;

  const ships = (Array.isArray(r.ships) ? r.ships : [])
    .map(pickShip)
    .filter((s): s is FleetSeaShip => s !== null)
    .map((s) => {
      if (paused) return { ...s, state: 'resting' as const };
      if (stale && s.state === 'working') return { ...s, state: 'idle' as const };
      return s;
    });

  const out: FleetSeaResponse = {
    generated_at: generatedAt,
    fleet_paused: paused,
    stale,
    ships,
    external: {
      window_s: num(ext.window_s) || 900,
      calls: num(ext.calls),
      agents_bucket: oneOf(BUCKETS, ext.agents_bucket, '0'),
      by_category: (Array.isArray(ext.by_category) ? ext.by_category : [])
        .filter(isObj)
        .map((c) => ({ category: String(str(c.category) ?? ''), calls: num(c.calls) })),
    },
    honesty: { last_activity_at: str(hon.last_activity_at) },
  };
  const until = str(r.paused_until_minute);
  if (paused && until !== null) out.paused_until_minute = until;
  return out;
}

export async function getFleetSea(nowMs = Date.now()): Promise<FleetSeaResponse> {
  let redis: Awaited<ReturnType<typeof ensureRedisConnected>> | null = null;
  try {
    redis = await ensureRedisConnected();
    const cached = await redis.get(FLEET_SEA_CACHE_KEY);
    if (cached) return JSON.parse(cached) as FleetSeaResponse;
  } catch {
    redis = null;
  }
  let raw: unknown = null;
  if (redis) {
    try {
      const s = await redis.get(FLEET_SEA_KEY);
      raw = s ? JSON.parse(s) : null;
    } catch {
      raw = null;
    }
  }
  const out = serializeFleetSea(raw, nowMs);
  if (redis) {
    try {
      await redis.set(FLEET_SEA_CACHE_KEY, JSON.stringify(out), 'EX', FLEET_SEA_CACHE_TTL_S);
    } catch {
      /* cache is best-effort */
    }
  }
  return out;
}
