import { readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { Reader, type CountryResponse } from 'mmdb-lib';
import { logger } from '../config/logger';
import { geoDbLoaded } from '../services/metrics.service';

/**
 * UC-22 IP country source of truth: an in-process lookup in the DB-IP Country Lite MMDB
 * (CC BY 4.0, refreshed monthly by scripts/geo-db-refresh.sh). Country level only. Fail-closed
 * contract with the registration rule: any failure here is null, which means "IP rule not applied".
 */
export const DEFAULT_GEO_MMDB_PATH = resolve(__dirname, '../../data/geo/dbip-country-lite.mmdb');
const RECHECK_MS = 10 * 60_000;
const RETRY_MISSING_MS = 60_000;

let reader: Reader<CountryResponse> | null = null;
let loadedMtimeMs = 0;
let checkedAt = 0;
let warned = false;

function dbPath(): string {
  return process.env.GEO_MMDB_PATH || DEFAULT_GEO_MMDB_PATH;
}

function warnOnce(reason: string): void {
  if (warned) return;
  warned = true;
  logger.warn({ path: dbPath(), reason }, 'geo_db_missing');
}

/** Load (or reload after a monthly refresh) the database; at most one stat per interval. */
function ensureLoaded(): Reader<CountryResponse> | null {
  const now = Date.now();
  if (checkedAt !== 0 && now - checkedAt < (reader ? RECHECK_MS : RETRY_MISSING_MS)) return reader;
  checkedAt = now;
  try {
    const path = dbPath();
    const mtime = statSync(path).mtimeMs;
    if (!reader || mtime !== loadedMtimeMs) {
      reader = new Reader<CountryResponse>(readFileSync(path));
      loadedMtimeMs = mtime;
    }
    geoDbLoaded.set(1);
    return reader;
  } catch (err) {
    // an unreadable file after a refresh keeps the previous in-memory database serving
    if (!reader) geoDbLoaded.set(0);
    warnOnce(err instanceof Error ? err.message : 'unreadable');
    return reader;
  }
}

/** Opens the database at startup so geo_db_loaded is exported from the first scrape. */
export function warmGeoDb(): void {
  ensureLoaded();
}

/** ISO 3166-1 alpha-2 country of an IP address, or null (no database, unparsable or unknown IP). */
export function countryOf(ip: unknown): string | null {
  if (typeof ip !== 'string') return null;
  const addr = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(addr) === 0) return null;
  const r = ensureLoaded();
  if (!r) return null;
  try {
    const iso = r.get(addr)?.country?.iso_code;
    return typeof iso === 'string' && /^[A-Za-z]{2}$/.test(iso) ? iso.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Test hook: forget the loaded database and the one-shot warning. */
export function resetGeoLookupForTests(): void {
  reader = null;
  loadedMtimeMs = 0;
  checkedAt = 0;
  warned = false;
}
