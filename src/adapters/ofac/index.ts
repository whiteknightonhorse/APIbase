import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SdnCsvRow, AltCsvRow, OfacSdnMatch, OfacAlias, OfacProgram } from './types';

const SDN_CSV_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.csv';
const ALT_CSV_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/alt.csv';

const NULL_VAL = /^-0-\s*$/;

function normalise(v: string): string {
  return NULL_VAL.test(v) ? '' : v.trim().replace(/^"|"$/g, '');
}

/** Parse OFAC CSV (no header row, comma-separated, values may be quoted). */
function parseOfacCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        fields.push(normalise(cur));
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(normalise(cur));
    rows.push(fields);
  }
  return rows;
}

function rowToSdn(f: string[]): SdnCsvRow {
  return {
    ent_num: parseInt(f[0] ?? '0', 10),
    sdn_name: f[1] ?? '',
    sdn_type: f[2] ?? '',
    program: f[3] ?? '',
    title: f[4] ?? '',
    call_sign: f[5] ?? '',
    voc_type: f[6] ?? '',
    tonnage: f[7] ?? '',
    grt: f[8] ?? '',
    vess_flag: f[9] ?? '',
    vess_owner: f[10] ?? '',
    remarks: f[11] ?? '',
  };
}

function rowToAlt(f: string[]): AltCsvRow {
  return {
    ent_num: parseInt(f[0] ?? '0', 10),
    alt_num: parseInt(f[1] ?? '0', 10),
    alt_type: f[2] ?? '',
    alt_name: f[3] ?? '',
    alt_remarks: f[4] ?? '',
  };
}

/**
 * OFAC Sanctions List adapter (UC-590).
 *
 * Tools (read-only, no auth required — US Treasury public domain):
 *   ofac.sdn.search         → SDN CSV name/type/program search
 *   ofac.sdn.aliases        → Alternate names for a given entity number (alt CSV)
 *   ofac.meta.programs      → Unique sanctions programs + entity counts (SDN CSV)
 *   ofac.meta.publication_info → Publication date + SHA-256 digest (HTTP HEAD)
 *
 * The SDN CSV is ~5.6 MB so maxResponseBytes is raised to 7 MB.
 * cache_ttl in tool_provider_config.yaml mitigates repeated downloads.
 */
export class OfacAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'ofac',
      baseUrl: 'https://sanctionslistservice.ofac.treas.gov',
      maxResponseBytes: 7_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; compliance data aggregation)',
      Accept: 'text/csv,text/plain,*/*',
    };

    switch (req.toolId) {
      case 'ofac.sdn.search':
        return { url: SDN_CSV_URL, method: 'GET', headers };

      case 'ofac.sdn.aliases':
        return { url: ALT_CSV_URL, method: 'GET', headers };

      case 'ofac.meta.programs':
        return { url: SDN_CSV_URL, method: 'GET', headers };

      case 'ofac.meta.publication_info':
        return { url: SDN_CSV_URL, method: 'HEAD', headers };

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unknown OFAC tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const p = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'ofac.sdn.search':
        return parseSdnSearch(raw.body, p);

      case 'ofac.sdn.aliases':
        return parseAliases(raw.body, p);

      case 'ofac.meta.programs':
        return parsePrograms(raw.body);

      case 'ofac.meta.publication_info':
        return parsePublicationInfo(raw.headers ?? {});

      default:
        return raw.body;
    }
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseSdnSearch(body: unknown, params: Record<string, unknown>): unknown {
  const text = String(body ?? '');
  const name = String(params.name ?? '')
    .toLowerCase()
    .trim();
  const typeFilter = params.type ? String(params.type).toLowerCase() : '';
  const programFilter = params.program ? String(params.program).toUpperCase() : '';
  const limit = Math.max(1, Math.min(50, Number(params.limit ?? 20)));

  if (!name) {
    return { matches: [], total_searched: 0, note: 'No name provided' };
  }

  const rows = parseOfacCsv(text);
  const matches: OfacSdnMatch[] = [];

  for (const f of rows) {
    if (f.length < 4) continue;
    const sdn = rowToSdn(f);
    if (!sdn.sdn_name) continue;

    const nameMatch = sdn.sdn_name.toLowerCase().includes(name);
    if (!nameMatch) continue;

    if (typeFilter && sdn.sdn_type.toLowerCase() !== typeFilter) continue;
    if (programFilter && sdn.program.toUpperCase() !== programFilter) continue;

    matches.push({
      ent_num: sdn.ent_num,
      name: sdn.sdn_name,
      type: sdn.sdn_type || 'entity',
      program: sdn.program,
      title: sdn.title,
      remarks: sdn.remarks,
    });

    if (matches.length >= limit) break;
  }

  return {
    matches,
    count: matches.length,
    limit,
    source: 'OFAC SDN List — US Treasury, public domain',
    last_modified: 'See ofac.meta.publication_info for current publication date',
  };
}

function parseAliases(body: unknown, params: Record<string, unknown>): unknown {
  const text = String(body ?? '');
  const entNum = parseInt(String(params.ent_num ?? '0'), 10);

  if (!entNum) {
    return { ent_num: 0, aliases: [], note: 'Invalid entity number' };
  }

  const rows = parseOfacCsv(text);
  const aliases: OfacAlias[] = [];

  for (const f of rows) {
    if (f.length < 4) continue;
    const alt = rowToAlt(f);
    if (alt.ent_num !== entNum) continue;
    aliases.push({
      alt_num: alt.alt_num,
      type: alt.alt_type,
      name: alt.alt_name,
      remarks: alt.alt_remarks,
    });
  }

  return {
    ent_num: entNum,
    aliases,
    count: aliases.length,
    source: 'OFAC SDN Alternate Names List — US Treasury, public domain',
  };
}

function parsePrograms(body: unknown): unknown {
  const text = String(body ?? '');
  const rows = parseOfacCsv(text);
  const counts: Record<string, number> = {};

  for (const f of rows) {
    if (f.length < 4) continue;
    const sdn = rowToSdn(f);
    const prog = sdn.program || 'UNKNOWN';
    counts[prog] = (counts[prog] ?? 0) + 1;
  }

  const programs: OfacProgram[] = Object.entries(counts)
    .map(([code, entity_count]) => ({ code, entity_count }))
    .sort((a, b) => b.entity_count - a.entity_count);

  return {
    programs,
    total_programs: programs.length,
    total_entities: programs.reduce((s, p) => s + p.entity_count, 0),
    source: 'OFAC SDN List — US Treasury, public domain',
  };
}

function parsePublicationInfo(headers: Record<string, string>): unknown {
  const lastMod = headers['last-modified'] ?? headers['Last-Modified'] ?? '';
  const digest = headers['digest'] ?? headers['Digest'] ?? '';

  let sha256 = '';
  if (digest.startsWith('sha-256=')) {
    sha256 = digest.slice('sha-256='.length);
  }

  return {
    list_name: 'Specially Designated Nationals and Blocked Persons List (SDN)',
    publisher: 'US Department of the Treasury — Office of Foreign Assets Control (OFAC)',
    last_modified: lastMod,
    sha256_digest: sha256,
    source_url: SDN_CSV_URL,
    license: 'US Government — public domain (17 U.S.C. § 105)',
    note: 'OFAC updates the SDN list on business days as new designations are made.',
  };
}
