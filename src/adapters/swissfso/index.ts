import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SwissFsoDatabaseEntry,
  SwissFsoTableMetadata,
  SwissFsoQueryFilter,
  SwissFsoJsonStat2,
} from './types';

/**
 * Swiss Federal Statistics Office (FSO/BFS) — PxWeb STAT-TAB adapter (UC-526).
 *
 * API: https://www.pxweb.bfs.admin.ch/api/v1/de  (German only for navigation/data)
 * Auth: none — Swiss Open Government Data, commercial use permitted.
 * Licence: OGD Switzerland (Creative Commons CCZero / TERMS OF USE open data)
 *
 * NOTE: Only the German endpoint (/api/v1/de) supports full navigation.
 *       The English endpoint (/api/v1/en) only returns the root database list.
 *
 * Tools:
 *   swissfso.catalog.list     → GET  /api/v1/de               (filter by subject)
 *   swissfso.table.metadata   → GET  /api/v1/de/{db}/{db}.px  (table dimensions)
 *   swissfso.table.query      → POST /api/v1/de/{db}/{db}.px  (query with filters)
 *   swissfso.wages.monthly    → POST (hardcoded wage db, pre-built query)
 *
 * Table path convention: every database has exactly ONE table at {dbid}/{dbid}.px
 *
 * Subject codes (first 2 digits of dbid number):
 *   01=population  03=employment  06=industry  07=agriculture  09=construction
 *   10=tourism  13=social-security  14=health  15=education  21=sustainability
 */

const BASE = 'https://www.pxweb.bfs.admin.ch/api/v1/de';

// Pre-built wages database (monthly gross wages 2012–2024)
const WAGES_DB = 'px-x-0304010000_201';

// BFS subject codes for catalog filtering
const SUBJECT_MAP: Record<string, string> = {
  '01': 'population',
  '02': 'territory',
  '03': 'employment',
  '06': 'industry',
  '07': 'agriculture',
  '09': 'construction',
  '10': 'tourism',
  '11': 'transport',
  '13': 'social-security',
  '14': 'health',
  '15': 'education',
  '16': 'culture',
  '17': 'politics',
  '21': 'sustainability',
  '40': 'multi-subject',
};

export class SwissFsoAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'swissfso',
      baseUrl: BASE,
      maxResponseBytes: 5_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'APIbase-Gateway/1.0',
    };

    switch (req.toolId) {
      case 'swissfso.catalog.list':
        return { url: BASE, method: 'GET', headers };

      case 'swissfso.table.metadata': {
        const dbId = String(p.database_id ?? '').trim();
        this.validateDbId(dbId, req.toolId);
        return {
          url: `${BASE}/${encodeURIComponent(dbId)}/${encodeURIComponent(dbId + '.px')}`,
          method: 'GET',
          headers,
        };
      }

      case 'swissfso.table.query': {
        const dbId = String(p.database_id ?? '').trim();
        this.validateDbId(dbId, req.toolId);
        const rawFilters = (p.filters as SwissFsoQueryFilter[] | undefined) ?? [];
        const query = rawFilters.map((f) => ({
          code: f.code,
          selection: { filter: 'item', values: f.values },
        }));
        return {
          url: `${BASE}/${encodeURIComponent(dbId)}/${encodeURIComponent(dbId + '.px')}`,
          method: 'POST',
          headers,
          body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
        };
      }

      case 'swissfso.wages.monthly': {
        // Database px-x-0304010000_201: Monthly gross wages 2012–2024
        // Variable codes: Grossregion total='-1', Wirtschaftsabteilung total='-1'
        // Berufliche Stellung total='-1', Geschlecht total='-1'
        // Zentralwert: '1'=median, '2'=P10, '3'=P25, '4'=P75, '5'=P90
        const year = String(p.year ?? '2024').trim();
        const genderInput = String(p.gender ?? 'total')
          .toLowerCase()
          .trim();
        const genderCode =
          genderInput === 'female' || genderInput === 'frauen'
            ? '1'
            : genderInput === 'male' || genderInput === 'männer' || genderInput === 'manner'
              ? '2'
              : '-1'; // total
        const percentile = String(p.percentile ?? '1').trim(); // 1=median default

        const query = [
          { code: 'Jahr', selection: { filter: 'item', values: [year] } },
          { code: 'Grossregion', selection: { filter: 'item', values: ['-1'] } },
          { code: 'Wirtschaftsabteilung', selection: { filter: 'item', values: ['-1'] } },
          { code: 'Berufliche Stellung', selection: { filter: 'item', values: ['-1'] } },
          { code: 'Geschlecht', selection: { filter: 'item', values: [genderCode] } },
          {
            code: 'Zentralwert und andere Perzentile',
            selection: { filter: 'item', values: [percentile] },
          },
        ];

        return {
          url: `${BASE}/${WAGES_DB}/${WAGES_DB}.px`,
          method: 'POST',
          headers,
          body: JSON.stringify({ query, response: { format: 'json-stat2' } }),
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'swissfso.catalog.list':
        return this.parseCatalog(raw, req);

      case 'swissfso.table.metadata':
        return this.parseMetadata(raw, req);

      case 'swissfso.table.query':
      case 'swissfso.wages.monthly':
        return this.parseQueryResult(raw, req);

      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------

  private validateDbId(dbId: string, toolId: string): void {
    if (!dbId || dbId.includes('..') || dbId.includes('/') || dbId.includes('\0')) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message:
          'database_id is required and must be a valid BFS database identifier (e.g. px-x-0304010000_201)',
        provider: this.provider,
        toolId,
        durationMs: 0,
      };
    }
  }

  private parseCatalog(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const p = req.params as Record<string, unknown>;
    const subject = String(p.subject ?? '').trim();
    const limit = Math.min(200, Math.max(1, Number(p.limit ?? 50)));

    const all = raw.body as SwissFsoDatabaseEntry[];
    if (!Array.isArray(all)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Unexpected catalog response format',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    let filtered = all;
    if (subject) {
      // Subject can be code ("01") or name ("population")
      const codeMatch = Object.entries(SUBJECT_MAP).find(
        ([code, name]) => code === subject || name === subject.toLowerCase(),
      );
      const prefix = codeMatch ? `px-x-${codeMatch[0]}` : `px-x-${subject}`;
      filtered = all.filter((d) => d.dbid.startsWith(prefix));
    }

    const page = filtered.slice(0, limit);
    return {
      total: all.length,
      filtered: filtered.length,
      returned: page.length,
      subject_filter: subject || null,
      subject_codes: SUBJECT_MAP,
      datasets: page.map((d) => ({
        database_id: d.dbid,
        subject_code: d.dbid.replace('px-x-', '').substring(0, 2),
        subject_name: SUBJECT_MAP[d.dbid.replace('px-x-', '').substring(0, 2)] ?? 'unknown',
        note: 'Use table.metadata to see dimensions; table.query to fetch data',
      })),
    };
  }

  private parseMetadata(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const data = raw.body as SwissFsoTableMetadata;
    if (!data || typeof data !== 'object' || !data.title || !Array.isArray(data.variables)) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Unexpected metadata response — is the database_id valid?',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    const p = req.params as Record<string, unknown>;
    return {
      database_id: String(p.database_id ?? ''),
      title: data.title,
      language: 'de',
      variables: data.variables.map((v) => ({
        code: v.code,
        label: v.text,
        value_count: v.values.length,
        values: v.values.map((val, i) => ({ code: val, label: v.valueTexts[i] ?? val })),
      })),
      usage_hint: 'Pass variables as filters in table.query: [{code, values: [code_value, ...]}]',
    };
  }

  private parseQueryResult(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const data = raw.body as SwissFsoJsonStat2;
    if (!data || typeof data !== 'object' || data.class !== 'dataset') {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: 'Unexpected JSON-stat2 response from BFS STAT-TAB',
        provider: this.provider,
        toolId: req.toolId,
        durationMs: raw.durationMs,
      };
    }

    // Build human-readable dimension labels
    const dims: Record<string, string[]> = {};
    for (const dimId of data.id ?? []) {
      const dimMeta = data.dimension?.[dimId];
      const labels = dimMeta?.category?.label;
      if (labels) {
        dims[dimId] = Object.values(labels);
      } else {
        dims[dimId] = [];
      }
    }

    const p = req.params as Record<string, unknown>;
    return {
      database_id: String(p.database_id ?? WAGES_DB),
      dimensions: data.id,
      dimension_sizes: data.size,
      dimension_labels: dims,
      value_count: (data.value ?? []).length,
      values: data.value,
      note: 'Values correspond to all dimension combinations in Cartesian order (C-order / row-major)',
      source: 'Swiss Federal Statistical Office (BFS/FSO) STAT-TAB — CC-Zero / Swiss OGD',
    };
  }
}
