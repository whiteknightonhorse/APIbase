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

const OECD_BASE = 'https://sdmx.oecd.org/public/rest';

/**
 * OECD SDMX public REST API adapter (UC-629).
 *
 * The OECD publishes its full statistical catalog (1500+ dataflows across every OECD
 * directorate — national accounts, education, environment, tax, trade, employment, etc.)
 * as a public, no-auth SDMX 2.1 REST API. Structurally analogous to INE Chile's SIMEL API
 * (see UC-602 `ine-chile`) — same SDMX-JSON dataSets/series shape — but identifiers are
 * 3-part (agency_id, dataflow_id, version) instead of a single fixed agency.
 *   oecd-data.dataflows -> GET /dataflow/all/all/latest?detail=allstubs, client-side filtered by query/agency
 *   oecd-data.structure -> GET /dataflow/{agency}/{id}/{version}?references=all (dimensions + codelists)
 *   oecd-data.data      -> GET /data/{agency},{id},{version}/{key}?startPeriod=&endPeriod=&lastNObservations=
 */
export class OecdDataAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'oecd-data', baseUrl: OECD_BASE, maxResponseBytes: 2_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'oecd-data.dataflows':
        return {
          url: `${OECD_BASE}/dataflow/all/all/latest?references=none&detail=allstubs`,
          method: 'GET',
          headers: { Accept: 'application/vnd.sdmx.structure+json;version=1.0' },
        };

      case 'oecd-data.structure': {
        const agencyId = String(params.agency_id || '').trim();
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!agencyId || !dataflowId) {
          throw this.invalidInput(req.toolId, 'agency_id and dataflow_id are required');
        }
        const version = String(params.version || '').trim();
        return {
          url: `${OECD_BASE}/dataflow/${encodeURIComponent(agencyId)}/${encodeURIComponent(dataflowId)}/${encodeURIComponent(version)}?references=all`,
          method: 'GET',
          headers: { Accept: 'application/vnd.sdmx.structure+json;version=1.0' },
        };
      }

      case 'oecd-data.data': {
        const agencyId = String(params.agency_id || '').trim();
        const dataflowId = String(params.dataflow_id || '').trim();
        if (!agencyId || !dataflowId) {
          throw this.invalidInput(req.toolId, 'agency_id and dataflow_id are required');
        }
        const version = String(params.version || '').trim();
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
          url: `${OECD_BASE}/data/${encodeURIComponent(agencyId)},${encodeURIComponent(dataflowId)},${encodeURIComponent(version)}/${encodeURIComponent(key)}${query ? `?${query}` : ''}`,
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
      case 'oecd-data.dataflows': {
        const msg = raw.body as SdmxDataflowMessage;
        const dataflows = msg.data.dataflows ?? [];
        const query = String(params.query || '')
          .trim()
          .toLowerCase();
        const agencyFilter = String(params.agency_id || '')
          .trim()
          .toLowerCase();
        const filtered = dataflows.filter((df) => {
          const matchesQuery = query
            ? df.id.toLowerCase().includes(query) ||
              (df.names?.en ?? df.name ?? '').toLowerCase().includes(query)
            : true;
          const matchesAgency = agencyFilter
            ? df.agencyID.toLowerCase().includes(agencyFilter)
            : true;
          return matchesQuery && matchesAgency;
        });
        const limited = filtered.slice(0, 200);
        return {
          total: filtered.length,
          returned: limited.length,
          dataflows: limited.map((df) => ({
            agency_id: df.agencyID,
            dataflow_id: df.id,
            version: df.version,
            name: df.names?.en ?? df.name ?? null,
          })),
        };
      }

      case 'oecd-data.structure': {
        const msg = raw.body as SdmxStructureMessage;
        const codelists = msg.data.codelists ?? [];
        const codelistById = new Map<string, SdmxCodelist>(codelists.map((cl) => [cl.id, cl]));
        const dsd = msg.data.dataStructures?.[0];
        const dims = dsd?.dataStructureComponents?.dimensionList?.dimensions ?? [];

        return {
          agency_id: params.agency_id,
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

      case 'oecd-data.data': {
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
          agency_id: params.agency_id,
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
