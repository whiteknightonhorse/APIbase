import { createHash } from 'node:crypto';
import { logger } from '../../config/logger';
import { ALT_CSV_URL, SDN_CSV_URL, parseOfacCsv, rowToAlt, rowToSdn } from '../../utils/ofac-csv';
import type { ShopTx } from '../db';

// `Digital Currency Address - <SYM> <addr>` inside OFAC `remarks` (F-13 layer 1).
const ADDRESS_RE = /Digital Currency Address - ([A-Z0-9]+) (\S+)/g;

/** Extract lowercase addresses from one remarks string. */
export function extractAddresses(remarks: string): string[] {
  const out: string[] = [];
  for (const m of remarks.matchAll(ADDRESS_RE)) {
    out.push(m[2].replace(/[;,.]+$/, '').toLowerCase());
  }
  return out;
}

/** Addresses from sdn.csv (+ alt.csv remarks) text, via the existing OFAC CSV parser. */
export function addressesFromCsv(sdnCsv: string, altCsv = ''): string[] {
  const found = new Set<string>();
  for (const f of parseOfacCsv(sdnCsv)) {
    if (f.length < 4) continue;
    extractAddresses(rowToSdn(f).remarks).forEach((a) => found.add(a));
  }
  for (const f of parseOfacCsv(altCsv)) {
    if (f.length < 4) continue;
    extractAddresses(rowToAlt(f).alt_remarks).forEach((a) => found.add(a));
  }
  return [...found];
}

export async function isSanctioned(db: ShopTx, address: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM shop_sanctioned_addresses WHERE address = $1`,
    address.toLowerCase(),
  );
  return rows.length > 0;
}

export type CsvSource = () => Promise<{ sdn: string; alt: string }>;

const HEADERS = {
  'User-Agent': 'APIbase/1.0 (https://apibase.pro; compliance data aggregation)',
  Accept: 'text/csv,text/plain,*/*',
};

const downloadOfac: CsvSource = async () => {
  const get = async (url: string): Promise<string> => {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`OFAC ${url} -> HTTP ${res.status}`);
    return res.text();
  };
  return { sdn: await get(SDN_CSV_URL), alt: await get(ALT_CSV_URL) };
};

/**
 * Job `ofac-sdn-sync` (daily, worker). Source unreachable -> previous rows stay, warn.
 * Upsert only (never deletes), so a repeated sync leaves no duplicates.
 */
export async function syncOfacSdn(
  db: ShopTx,
  source: CsvSource = downloadOfac,
): Promise<{ synced: number; list_version: string } | null> {
  let csv: { sdn: string; alt: string };
  try {
    csv = await source();
  } catch (err) {
    logger.warn(
      { err, job: 'ofac-sdn-sync' },
      'OFAC source unavailable; keeping previous addresses',
    );
    return null;
  }
  const addresses = addressesFromCsv(csv.sdn, csv.alt);
  const list_version = createHash('sha256').update(csv.sdn).digest('hex').slice(0, 16);
  if (addresses.length > 0) {
    await db.$executeRawUnsafe(
      `INSERT INTO shop_sanctioned_addresses (address, source, list_version, synced_at)
       SELECT a, 'ofac_sdn', $2, now() FROM unnest($1::text[]) AS a
       ON CONFLICT (address) DO UPDATE SET list_version = EXCLUDED.list_version, synced_at = now()`,
      addresses,
      list_version,
    );
  }
  logger.info({ job: 'ofac-sdn-sync', synced: addresses.length, list_version }, 'OFAC SDN synced');
  return { synced: addresses.length, list_version };
}
