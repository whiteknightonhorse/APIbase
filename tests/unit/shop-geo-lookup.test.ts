/**
 * T-0567 L1-L5: UC-22 in-process IP country lookup (DB-IP Country Lite MMDB, fixture generated here).
 */
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCountryMmdb } from '../fixtures/mmdb-fixture';

const warn = jest.fn();
jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: (...a: unknown[]) => warn(...a), error: jest.fn() },
}));

import { countryOf, resetGeoLookupForTests } from '../../src/shop/geo-lookup';
import { geoOf } from '../../src/shop/geo-headers';

const dir = mkdtempSync(join(tmpdir(), 'geo-'));
const mmdb = join(dir, 'fixture.mmdb');
writeFileSync(
  mmdb,
  buildCountryMmdb([
    { cidr: '203.0.113.0/24', country: 'CU' },
    { cidr: '198.51.100.0/24', country: 'DE' },
  ]),
);

beforeEach(() => {
  warn.mockClear();
  resetGeoLookupForTests();
  process.env.GEO_MMDB_PATH = mmdb;
  delete process.env.INTEGRATOR_GEO_HEADERS;
});
afterAll(() => {
  delete process.env.GEO_MMDB_PATH;
});

describe('countryOf / geoOf', () => {
  it('L1 answers from the database, incl. IPv4-mapped IPv6; unknown address -> null', () => {
    expect(countryOf('203.0.113.7')).toBe('CU');
    expect(countryOf('::ffff:198.51.100.9')).toBe('DE');
    expect(countryOf('192.0.2.1')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('L2 unparsable or non-string input -> null', () => {
    for (const bad of ['not-an-ip', '', '999.1.1.1', ['203.0.113.7'], undefined, 42]) {
      expect(countryOf(bad)).toBeNull();
    }
  });

  it('L3 missing database -> null and geo_db_missing is logged once', () => {
    process.env.GEO_MMDB_PATH = join(dir, 'absent.mmdb');
    expect(countryOf('203.0.113.7')).toBeNull();
    expect(countryOf('203.0.113.8')).toBeNull();
    expect(geoOf({ headers: {}, ip: '203.0.113.9' }).ip_country).toBeNull();
    expect(warn.mock.calls.filter((c) => c[1] === 'geo_db_missing')).toHaveLength(1);
  });

  it('L4 geoOf: lookup of req.ip when no trusted edge; region stays null', () => {
    expect(geoOf({ headers: {}, ip: '203.0.113.7' })).toEqual({
      ip_country: 'CU',
      ip_region: null,
    });
  });

  it('L5 trusted header takes precedence over the lookup; untrusted header is ignored', () => {
    const headers = { 'x-apibase-geo-country': 'DE' };
    expect(geoOf({ headers, ip: '203.0.113.7' }).ip_country).toBe('CU');
    process.env.INTEGRATOR_GEO_HEADERS = 'trusted';
    expect(geoOf({ headers, ip: '203.0.113.7' }).ip_country).toBe('DE');
  });
});

describe('T-0609 one descriptor for mtime and read', () => {
  afterEach(() => jest.restoreAllMocks());

  function bump(f: string, t0: number): void {
    const when = new Date(t0 + 5_000_000);
    utimesSync(f, when, when);
  }

  it('F1 reloads when the mtime changes and closes every descriptor it opened', () => {
    const f = join(dir, 'reload.mmdb');
    writeFileSync(f, buildCountryMmdb([{ cidr: '203.0.113.0/24', country: 'CU' }]));
    process.env.GEO_MMDB_PATH = f;
    const open = jest.spyOn(fs, 'openSync');
    const close = jest.spyOn(fs, 'closeSync');
    const t0 = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
    expect(countryOf('203.0.113.7')).toBe('CU');
    writeFileSync(f, buildCountryMmdb([{ cidr: '203.0.113.0/24', country: 'DE' }]));
    bump(f, t0);
    now.mockReturnValue(t0 + 11 * 60_000);
    expect(countryOf('203.0.113.7')).toBe('DE');
    expect(open.mock.calls.length).toBe(close.mock.calls.length);
    expect(close.mock.calls.length).toBeGreaterThan(0);
  });

  it('F2 unreadable content keeps the previous reader and still closes the descriptor', () => {
    const f = join(dir, 'torn.mmdb');
    writeFileSync(f, buildCountryMmdb([{ cidr: '203.0.113.0/24', country: 'CU' }]));
    process.env.GEO_MMDB_PATH = f;
    const open = jest.spyOn(fs, 'openSync');
    const close = jest.spyOn(fs, 'closeSync');
    const t0 = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
    expect(countryOf('203.0.113.7')).toBe('CU');
    writeFileSync(f, 'garbage');
    bump(f, t0);
    now.mockReturnValue(t0 + 11 * 60_000);
    expect(countryOf('203.0.113.7')).toBe('CU');
    expect(open.mock.calls.length).toBe(close.mock.calls.length);
  });
});
