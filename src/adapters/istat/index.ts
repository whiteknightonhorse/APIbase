import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SdmxDataflowMessage,
  SdmxStructureMessage,
  SdmxDataMessage,
  SdmxCodelist,
} from './types';

const ISTAT_BASE = 'https://esploradati.istat.it/SDMXWS/rest';
const MAX_CODES_PER_DIMENSION = 200;

/**
 * ISTAT SDMX public REST API adapter (UC-656).
 *
 * The Italian National Institute of Statistics publishes its full economic/social-statistics
 * catalog (~4900 dataflows — population, prices, labour, agriculture, trade, national accounts)
 * as a public, no-auth SDMX 2.1 REST API. Structurally identical to the OECD/ILOSTAT SDMX
 * adapters (see UC-629 `oecd-data`, UC-651 `ilostat`) — same SDMX-JSON dataSets/series shape —
 * but ISTAT publishes under a single fixed agency (IT1), so identifiers only need dataflow_id +
 * version (no agency_id).
 *   istat.dataflows -> GET /dataflow/IT1/all/latest?references=none&detail=allstubs, client-side
 *                       filtered by query
 *   istat.structure -> GET /dataflow/IT1/{id}/{version}?references=all (dimensions + codelists).
 *                       ISTAT's territorial codelist (CL_ITTER107, the national/regional/
 *                       provincial hierarchy) has 12,471 codes and is reused by nearly every
 *                       dataflow's REF_AREA dimension — codes per dimension are capped to 200
 *                       (national/regional codes sort first) with a total_codes count, to keep
 *                       the normalized response bounded.
 *   istat.data      -> GET /data/{id}/{key}?startPeriod=&endPeriod=&lastNObservations=. Unlike
 *                       ILOSTAT, an unfiltered "all" key on ISTAT dataflows routinely returns a
 *                       malformed/truncated multi-MB body (observed directly against the live
 *                       API), so last_n_observations is capped tighter (1-20, default 5) than
 *                       the ILOSTAT adapter's 1-100 to keep typical wildcard-key responses within
 *                       the byte limit.
 *
 * ISTAT's IIS backend returns a malformed HTTP 500 ("languageTag1", 12 bytes) to Node's
 * `fetch`/undici on every endpoint when no `Accept-Language` header is present — reproduced with
 * a minimal-headers `fetch()` call outside the pipeline; curl (which also omits Accept-Language)
 * is unaffected, so this is specific to undici's header set, not a generic bot block. Every
 * request sends `Accept-Language: en` to avoid it.
 */
export class IstatAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'istat',
      baseUrl: ISTAT_BASE,
      maxResponseBytes: 6_000_000,
      // dataflow list (~1.7MB) and structure (~2.6MB) responses are dynamically generated
      // upstream and observed to take 9-13s — above the 10s platform default.
      timeoutMs: 20_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'istat.dataflows':
        return {
          url: `${ISTAT_BASE}/dataflow/IT1/all/latest?references=none&detail=allstubs`,
          method: 'GET',
          headers: {
            Accept: 'application/vnd.sdmx.structure+json;version=1.0',
            'Accept-Language': 'en',
          },
        };

      case 'istat.structure': {
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!dataflowId) {
          throw this.invalidInput(req.toolId, 'dataflow_id is required');
        }
        const version = String(params.version || '').trim();
        return {
          url: `${ISTAT_BASE}/dataflow/IT1/${encodeURIComponent(dataflowId)}/${encodeURIComponent(version)}?references=all`,
          method: 'GET',
          headers: {
            Accept: 'application/vnd.sdmx.structure+json;version=1.0',
            'Accept-Language': 'en',
          },
        };
      }

      case 'istat.data': {
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!dataflowId) {
          throw this.invalidInput(req.toolId, 'dataflow_id is required');
        }
        const key = String(params.key || 'all').trim() || 'all';
        const qs = new URLSearchParams();
        if (params.start_period) qs.set('startPeriod', String(params.start_period));
        if (params.end_period) qs.set('endPeriod', String(params.end_period));
        if (!params.start_period && !params.end_period) {
          const lastN = Math.min(Math.max(Number(params.last_n_observations) || 5, 1), 20);
          qs.set('lastNObservations', String(lastN));
        }
        const query = qs.toString();
        return {
          url: `${ISTAT_BASE}/data/${encodeURIComponent(dataflowId)}/${encodeURIComponent(key)}${query ? `?${query}` : ''}`,
          method: 'GET',
          headers: {
            Accept: 'application/vnd.sdmx.data+json;version=1.0',
            'Accept-Language': 'en',
          },
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'istat.dataflows': {
        const msg = raw.body as SdmxDataflowMessage;
        const dataflows = msg.data.dataflows ?? [];
        const query = String(params.query || '')
          .trim()
          .toLowerCase();
        const filtered = dataflows.filter((df) => {
          return query
            ? df.id.toLowerCase().includes(query) ||
                (df.names?.en ?? df.name ?? '').toLowerCase().includes(query)
            : true;
        });
        const limited = filtered.slice(0, 200);
        return {
          total: filtered.length,
          returned: limited.length,
          dataflows: limited.map((df) => ({
            dataflow_id: df.id,
            version: df.version,
            name: df.names?.en ?? df.name ?? null,
          })),
        };
      }

      case 'istat.structure': {
        const msg = raw.body as SdmxStructureMessage;
        const codelists = msg.data.codelists ?? [];
        const codelistById = new Map<string, SdmxCodelist>(codelists.map((cl) => [cl.id, cl]));
        const dsd = msg.data.dataStructures?.[0];
        const dims = dsd?.dataStructureComponents?.dimensionList?.dimensions ?? [];

        return {
          dataflow_id: params.dataflow_id,
          name: msg.data.dataflows?.[0]?.names?.en ?? msg.data.dataflows?.[0]?.name ?? null,
          dimensions: dims
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((dim) => {
              const enumeration = dim.localRepresentation?.enumeration ?? '';
              const codelistId = enumeration.split(':').pop()?.split('(')[0] ?? '';
              const codelist = codelistById.get(codelistId);
              const codes = codelist?.codes ?? [];
              return {
                dimension_id: dim.id,
                position: dim.position,
                total_codes: codes.length,
                codes: codes.slice(0, MAX_CODES_PER_DIMENSION).map((c) => ({
                  code: c.id,
                  name: c.names?.en ?? c.name ?? null,
                })),
              };
            }),
        };
      }

      case 'istat.data': {
        const msg = raw.body as SdmxDataMessage;
        const dataSet = msg.data.dataSets?.[0];
        const seriesDims = msg.data.structure.dimensions.series ?? [];
        const obsDim = msg.data.structure.dimensions.observation?.[0];
        const seriesMap = dataSet?.series ?? {};

        const series = Object.entries(seriesMap).map(([key, s]) => {
          const positions = key.split(':').map((n) => Number(n));
          const dimensions: Record<string, string | null> = {};
          seriesDims.forEach((dim, i) => {
            const value = dim.values[positions[i]];
            dimensions[dim.id] = value?.names?.en ?? value?.name ?? value?.id ?? null;
          });
          const observations = Object.entries(s.observations).map(([obsKey, obs]) => {
            const periodValue = obsDim?.values[Number(obsKey)];
            return {
              period: periodValue?.id ?? obsKey,
              value: obs[0],
            };
          });
          return { dimensions, observations };
        });

        return {
          dataflow_id: params.dataflow_id,
          name: msg.data.structure.names?.en ?? msg.data.structure.name ?? null,
          series,
        };
      }

      default:
        return raw.body;
    }
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }
}
