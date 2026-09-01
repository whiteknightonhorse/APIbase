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

const ILOSTAT_BASE = 'https://sdmx.ilo.org/rest';

/**
 * ILOSTAT SDMX public REST API adapter (UC-651).
 *
 * The International Labour Organization publishes its full labor-statistics catalog (1200+
 * dataflows — employment, unemployment, wages, working time, labour force, informality, child
 * labour, occupational safety) as a public, no-auth SDMX 2.1 REST API. Structurally identical
 * to the OECD SDMX adapter (see UC-629 `oecd-data`) — same SDMX-JSON dataSets/series shape —
 * but ILOSTAT publishes under a single fixed agency (ILO), so identifiers only need
 * dataflow_id + version (no agency_id).
 *   ilostat.dataflows -> GET /dataflow/ILO/all/latest?detail=allstubs, client-side filtered by query
 *   ilostat.structure -> GET /dataflow/ILO/{id}/{version}?references=all (dimensions + codelists)
 *   ilostat.data      -> GET /data/{id}/{key}?startPeriod=&endPeriod=&lastNObservations=
 */
export class IlostatAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ilostat', baseUrl: ILOSTAT_BASE, maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'ilostat.dataflows':
        return {
          url: `${ILOSTAT_BASE}/dataflow/ILO/all/latest?references=none&detail=allstubs`,
          method: 'GET',
          headers: { Accept: 'application/vnd.sdmx.structure+json;version=1.0' },
        };

      case 'ilostat.structure': {
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!dataflowId) {
          throw this.invalidInput(req.toolId, 'dataflow_id is required');
        }
        const version = String(params.version || '').trim();
        return {
          url: `${ILOSTAT_BASE}/dataflow/ILO/${encodeURIComponent(dataflowId)}/${encodeURIComponent(version)}?references=all`,
          method: 'GET',
          headers: { Accept: 'application/vnd.sdmx.structure+json;version=1.0' },
        };
      }

      case 'ilostat.data': {
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!dataflowId) {
          throw this.invalidInput(req.toolId, 'dataflow_id is required');
        }
        const key = String(params.key || 'all').trim() || 'all';
        const qs = new URLSearchParams();
        if (params.start_period) qs.set('startPeriod', String(params.start_period));
        if (params.end_period) qs.set('endPeriod', String(params.end_period));
        if (!params.start_period && !params.end_period) {
          const lastN = Math.min(Math.max(Number(params.last_n_observations) || 10, 1), 100);
          qs.set('lastNObservations', String(lastN));
        }
        const query = qs.toString();
        return {
          url: `${ILOSTAT_BASE}/data/${encodeURIComponent(dataflowId)}/${encodeURIComponent(key)}${query ? `?${query}` : ''}`,
          method: 'GET',
          headers: { Accept: 'application/vnd.sdmx.data+json;version=1.0' },
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
      case 'ilostat.dataflows': {
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

      case 'ilostat.structure': {
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
              return {
                dimension_id: dim.id,
                position: dim.position,
                codes: (codelist?.codes ?? []).map((c) => ({
                  code: c.id,
                  name: c.names?.en ?? c.name ?? null,
                })),
              };
            }),
        };
      }

      case 'ilostat.data': {
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
