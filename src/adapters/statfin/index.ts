import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  JsonStat2Response,
  PxTableMetadata,
  PxTableListItem,
  StatfinDataPoint,
  StatfinOutput,
  StatfinTableListOutput,
} from './types';

const BASE = 'https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin';

// Fixed table paths for the curated tools
const TABLE_CPI = 'khi/11xs.px'; // Consumer Price Index, monthly 1972–present
const TABLE_POP = 'vaerak/11rb.px'; // Population 31 Dec, annual 1750–present
const TABLE_UNEM = 'tyonv/12r5.px'; // Unemployed jobseekers at month end, monthly

/** Unpack json-stat2 flat value array into [{period, value}] with the time dimension as key. */
function unpackJsonStat(body: JsonStat2Response): StatfinDataPoint[] {
  const ids = body.id; // e.g. ['timeperiod_m', 'contentscode']
  const sizes = body.size; // e.g. [N, M]
  const dims = body.dimension;

  if (!ids || ids.length === 0 || !body.value) return [];

  // Identify the time dimension (usually first)
  const timeDimIdx = ids.findIndex((id) => {
    const d = dims[id];
    return d && Object.keys(d.category.label).some((k) => /^\d{4}/.test(k));
  });
  const timeIdx = timeDimIdx >= 0 ? timeDimIdx : 0;
  const timeDimId = ids[timeIdx];
  const timeDim = dims[timeDimId];
  const timeLabels = Object.keys(timeDim.category.label);
  const timeSize = sizes[timeIdx];

  // For non-time dims, compute stride and pick index 0
  // Total cells = product of all sizes
  const totalCells = sizes.reduce((a, b) => a * b, 1);
  if (totalCells === 0) return [];

  const stride = timeSize > 0 ? totalCells / timeSize : 0;
  const results: StatfinDataPoint[] = [];

  for (let t = 0; t < timeSize && t < timeLabels.length; t++) {
    const period = timeLabels[t];
    const valIdx = t * stride; // stride = cells per time step across other dims
    const rawVal = body.value[valIdx] ?? null;
    results.push({
      period,
      value: rawVal !== null ? Number(rawVal) : null,
    });
  }

  return results;
}

export class StatfinAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'statfin', baseUrl: BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (req.toolId === 'statfin.table_search') {
      const category = encodeURIComponent(String(params.category ?? ''));
      return { url: `${BASE}/${category}`, method: 'GET', headers };
    }

    if (req.toolId === 'statfin.consumer_price_index') {
      const months = Math.min(Math.max(Number(params.months) || 12, 1), 120);
      const baseYear = String(params.base_year || '2015');
      const codeMap: Record<string, string> = {
        '1972': 'ip_0_1972',
        '1977': 'ip_0_1977',
        '1981': 'ip_0_1981',
        '1985': 'ip_0_1985',
        '1990': 'ip_0_1990',
        '1995': 'ip_0_1995',
        '2000': 'ip_0_2000',
        '2005': 'ip_0_2005',
        '2010': 'ip_0_2010',
        '2015': 'ip_0_2015',
        '2025': 'ip_0_2025',
      };
      const code = codeMap[baseYear] ?? 'ip_0_2015';
      return {
        url: `${BASE}/${TABLE_CPI}`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: [
            { code: 'contentscode', selection: { filter: 'item', values: [code] } },
            { code: 'timeperiod_m', selection: { filter: 'top', values: [String(months)] } },
          ],
          response: { format: 'json-stat2' },
        }),
      };
    }

    if (req.toolId === 'statfin.population') {
      const years = Math.min(Math.max(Number(params.years) || 10, 1), 276);
      const sex = String(params.sex || 'total');
      const sexMap: Record<string, string> = { total: 'SSS', male: '1', female: '2' };
      const sexCode = sexMap[sex] ?? 'SSS';
      return {
        url: `${BASE}/${TABLE_POP}`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: [
            {
              code: 'sukupuoli_9_20180101',
              selection: { filter: 'item', values: [sexCode] },
            },
            { code: 'contentscode', selection: { filter: 'item', values: ['vaerak-vaesto'] } },
            { code: 'timeperiod_y', selection: { filter: 'top', values: [String(years)] } },
          ],
          response: { format: 'json-stat2' },
        }),
      };
    }

    if (req.toolId === 'statfin.unemployment') {
      const months = Math.min(Math.max(Number(params.months) || 12, 1), 120);
      return {
        url: `${BASE}/${TABLE_UNEM}`,
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: [
            { code: 'Alue', selection: { filter: 'item', values: ['SSS'] } },
            {
              code: 'contentscode',
              selection: { filter: 'item', values: ['TYOTTOMATLOPUSSA'] },
            },
            { code: 'timeperiod_m', selection: { filter: 'top', values: [String(months)] } },
          ],
          response: { format: 'json-stat2' },
        }),
      };
    }

    throw {
      code: ProviderErrorCode.INVALID_RESPONSE,
      httpStatus: 502,
      message: `Unsupported tool: ${req.toolId}`,
      provider: this.provider,
      toolId: req.toolId,
      durationMs: 0,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const params = req.params as Record<string, unknown>;

    if (req.toolId === 'statfin.table_search') {
      const items = raw.body as PxTableListItem[];
      const category = String(params.category ?? '');
      const tables: StatfinTableListOutput = {
        category,
        total: items.length,
        tables: items.map((t) => ({
          id: t.id,
          title: t.text,
          updated: t.updated,
        })),
      };
      return tables;
    }

    if (req.toolId === 'statfin.consumer_price_index') {
      const body = raw.body as JsonStat2Response;
      const baseYear = String(params.base_year || '2015');
      const records = unpackJsonStat(body);
      const output: StatfinOutput = {
        title: body.label ?? 'Consumer Price Index',
        source: body.source ?? 'Statistics Finland',
        updated: body.updated ?? '',
        indicator: `CPI (${baseYear}=100)`,
        unit: 'index points',
        total_records: records.length,
        records,
      };
      return output;
    }

    if (req.toolId === 'statfin.population') {
      const body = raw.body as JsonStat2Response;
      const sex = String(params.sex || 'total');
      const sexLabel: Record<string, string> = {
        total: 'Total',
        male: 'Male',
        female: 'Female',
      };
      const records = unpackJsonStat(body);
      const output: StatfinOutput = {
        title: body.label ?? 'Population of Finland',
        source: body.source ?? 'Statistics Finland',
        updated: body.updated ?? '',
        indicator: `Population 31 Dec (${sexLabel[sex] ?? 'Total'})`,
        unit: 'persons',
        total_records: records.length,
        records,
      };
      return output;
    }

    if (req.toolId === 'statfin.unemployment') {
      const body = raw.body as JsonStat2Response;

      // The POST with Alue=SSS and single contentscode returns flat value[] with stride=1
      // but unpackJsonStat expects time as first dim — verify by checking ids
      const jsbody = body as JsonStat2Response;
      const ids = jsbody.id ?? [];
      const timeFirst = ids[0]?.startsWith('timeperiod') ?? false;

      let records: StatfinDataPoint[];
      if (timeFirst) {
        records = unpackJsonStat(body);
      } else {
        // Fallback: time is last dim — reorder manually
        const timeDimId = ids.find((id) => id.startsWith('timeperiod')) ?? ids[ids.length - 1];
        const timeDim = jsbody.dimension[timeDimId];
        const timeLabels = Object.keys(timeDim?.category?.label ?? {});
        records = timeLabels.map((period, i) => ({
          period,
          value: jsbody.value[i] !== undefined ? Number(jsbody.value[i]) : null,
        }));
      }

      const output: StatfinOutput = {
        title: body.label ?? 'Unemployed Jobseekers — Finland',
        source: body.source ?? 'Statistics Finland / TEM',
        updated: body.updated ?? '',
        indicator: 'Unemployed jobseekers at month end (whole country)',
        unit: 'persons',
        total_records: records.length,
        records,
      };
      return output;
    }

    return raw.body;
  }

  protected parseTableMetadata(raw: ProviderRawResponse): unknown {
    return raw.body as PxTableMetadata;
  }
}
