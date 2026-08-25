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

const INE_CHILE_BASE = 'https://sdmx.ine.gob.cl/rest';
const AGENCY = 'CL01';

/**
 * INE Chile (Instituto Nacional de Estadísticas) SIMEL adapter (UC-602).
 *
 * SIMEL (Sistema de Información del Mercado Laboral) publishes Chile's official
 * labour-market indicators as a public, no-auth SDMX 2.1 REST API — the same
 * dissemination protocol INE Spain uses (see UC-596 `ine`), so requests/response
 * shapes are structurally analogous even though the two national institutes are
 * unrelated services. Discovered via the SIMEL web app's inline `CONFIG` payload
 * (window.CONFIG.member.scope.datasources) — the site has no published API docs page.
 *   ine-chile.dataflows -> GET /dataflow, client-side filtered by query
 *   ine-chile.structure -> GET /dataflow/{AGENCY}/{id}/1.0?references=all (dimensions + codelists)
 *   ine-chile.data      -> GET /data/{AGENCY},{id},1.0/all?startPeriod=&endPeriod=&lastNObservations=
 */
export class IneChileAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ine-chile', baseUrl: INE_CHILE_BASE, maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    // NSI Web Service (openresty/.NET) throws HTTP 500 ("languageTag1") when it
    // receives undici's default `Accept-Language: *` — always send a concrete tag.
    const headers: Record<string, string> = {
      Accept: 'application/vnd.sdmx.data+json;version=1.0',
      'Accept-Language': 'es',
    };

    switch (req.toolId) {
      case 'ine-chile.dataflows':
        return {
          url: `${INE_CHILE_BASE}/dataflow/${AGENCY}/all/latest`,
          method: 'GET',
          headers: { ...headers, Accept: 'application/vnd.sdmx.structure+json;version=1.0' },
        };

      case 'ine-chile.structure': {
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!dataflowId) {
          throw this.invalidInput(req.toolId, 'dataflow_id is required');
        }
        return {
          url: `${INE_CHILE_BASE}/dataflow/${AGENCY}/${encodeURIComponent(dataflowId)}/1.0?references=all`,
          method: 'GET',
          headers: { ...headers, Accept: 'application/vnd.sdmx.structure+json;version=1.0' },
        };
      }

      case 'ine-chile.data': {
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!dataflowId) {
          throw this.invalidInput(req.toolId, 'dataflow_id is required');
        }
        const qs = new URLSearchParams();
        if (params.start_period) qs.set('startPeriod', String(params.start_period));
        if (params.end_period) qs.set('endPeriod', String(params.end_period));
        if (!params.start_period && !params.end_period) {
          const lastN = Math.min(Math.max(Number(params.last_n_observations) || 10, 1), 100);
          qs.set('lastNObservations', String(lastN));
        }
        const query = qs.toString();
        return {
          url: `${INE_CHILE_BASE}/data/${AGENCY},${encodeURIComponent(dataflowId)},1.0/all${query ? `?${query}` : ''}`,
          method: 'GET',
          headers,
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
      case 'ine-chile.dataflows': {
        const msg = raw.body as SdmxDataflowMessage;
        const dataflows = msg.data.dataflows ?? [];
        const query = String(params.query || '')
          .trim()
          .toLowerCase();
        const filtered = query
          ? dataflows.filter(
              (df) =>
                df.id.toLowerCase().includes(query) ||
                (df.names?.es ?? df.name ?? '').toLowerCase().includes(query),
            )
          : dataflows;
        return {
          total: filtered.length,
          dataflows: filtered.map((df) => ({
            dataflow_id: df.id,
            name: df.names?.es ?? df.name ?? null,
          })),
        };
      }

      case 'ine-chile.structure': {
        const msg = raw.body as SdmxStructureMessage;
        const dataflowId = String(params.dataflow_id);
        const codelists = msg.data.codelists ?? [];
        const codelistById = new Map<string, SdmxCodelist>(codelists.map((cl) => [cl.id, cl]));
        const dsd = msg.data.dataStructures?.[0];
        const dims = dsd?.dataStructureComponents?.dimensionList?.dimensions ?? [];

        return {
          dataflow_id: dataflowId,
          name: msg.data.dataflows?.[0]?.names?.es ?? msg.data.dataflows?.[0]?.name ?? null,
          dimensions: dims
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((dim) => {
              const enumeration = dim.localRepresentation?.enumeration ?? '';
              const codelistId = enumeration.split(':').pop()?.split('(')[0] ?? '';
              const codelist = codelistById.get(codelistId);
              return {
                dimension_id: dim.id,
                position: dim.position,
                codes: (codelist?.codes ?? []).map((c) => ({
                  code: c.id,
                  name: c.names?.es ?? c.name ?? null,
                })),
              };
            }),
        };
      }

      case 'ine-chile.data': {
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
            dimensions[dim.id] = value?.names?.es ?? value?.name ?? value?.id ?? null;
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
          name: msg.data.structure.names?.es ?? msg.data.structure.name ?? null,
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
