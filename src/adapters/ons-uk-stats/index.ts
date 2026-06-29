import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OnsDatasetListResponse,
  OnsObservationsResponse,
  OnsDatasetMetadata,
  OnsStatsOutput,
  OnsDatasetsOutput,
} from './types';

const ONS_BASE = 'https://api.beta.ons.gov.uk/v1';

// Module-level cache: dataset_id → latest observations version URL
// Populated on first call, persists for the lifetime of the process.
const versionUrlCache = new Map<string, string>();

interface DatasetConfig {
  datasetId: string;
  title: string;
  unit: string;
  buildDimensions: (params: Record<string, unknown>) => Record<string, string>;
}

const DATASET_CONFIG: Record<string, DatasetConfig> = {
  'ons.stats.cpih': {
    datasetId: 'cpih01',
    title: 'Consumer Prices Index Including Housing (CPIH)',
    unit: 'Index: 2015=100',
    buildDimensions: (p) => ({
      time: '*',
      geography: 'K02000001',
      aggregate: String(p.category ?? 'CP00'),
    }),
  },
  'ons.stats.gdp': {
    datasetId: 'gdp-to-four-decimal-places',
    title: 'GDP Monthly Estimate (Index of Services & Production)',
    unit: 'Index: Seasonally adjusted 2016=100',
    buildDimensions: (p) => ({
      time: '*',
      geography: 'K02000001',
      unofficialstandardindustrialclassification: String(p.sector ?? 'A--T'),
    }),
  },
  'ons.stats.unemployment': {
    datasetId: 'labour-market',
    title: 'UK Labour Market Statistics',
    unit: 'Rates (%) or Levels (thousands)',
    buildDimensions: (p) => ({
      time: '*',
      geography: 'K02000001',
      economicactivity: String(p.activity ?? 'unemployed'),
      agegroups: String(p.age_group ?? '16+'),
      sex: String(p.sex ?? 'all-adults'),
      seasonaladjustment: 'seasonal-adjustment',
      unitofmeasure: String(p.unit ?? 'rates'),
    }),
  },
  'ons.stats.population': {
    datasetId: 'mid-year-pop-est',
    title: 'UK Mid-Year Population Estimates',
    unit: 'Number of people',
    buildDimensions: (p) => ({
      time: '*',
      geography: String(p.geography ?? 'K04000001'),
      sex: String(p.sex ?? 'all'),
      age: String(p.age ?? 'total'),
    }),
  },
};

/**
 * ONS UK Statistics adapter (UC-533).
 *
 * UK Office for National Statistics: GDP, CPIH, unemployment, wages, population.
 * No auth required. OGL v3.0 (commercial use allowed). Unlimited free tier.
 * https://api.beta.ons.gov.uk/v1
 */
export class OnsUkStatsAdapter extends BaseAdapter {
  // Stores the current observations base URL for buildRequest to read.
  // Set synchronously before each super.call() invocation.
  private _observationsUrl: string | null = null;

  constructor() {
    super({ provider: 'ons-uk-stats', baseUrl: ONS_BASE });
  }

  async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId === 'ons.datasets.list') {
      // Simple single-call: no version discovery needed
      return super.call(req);
    }

    const config = DATASET_CONFIG[req.toolId];
    if (!config) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    // Discover the latest version URL if not cached
    if (!versionUrlCache.has(config.datasetId)) {
      try {
        const metaResp = await fetch(`${ONS_BASE}/datasets/${config.datasetId}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (!metaResp.ok) {
          throw new Error(`Metadata fetch returned HTTP ${metaResp.status}`);
        }
        const meta = (await metaResp.json()) as OnsDatasetMetadata;
        const href = meta?.links?.latest_version?.href;
        if (!href) {
          throw new Error('No latest_version href in ONS dataset metadata');
        }
        // Normalize: API may return http:// — use https://
        versionUrlCache.set(config.datasetId, href.replace(/^http:\/\//, 'https://'));
      } catch (err) {
        throw {
          code: ProviderErrorCode.UNAVAILABLE,
          httpStatus: 502,
          message: `Failed to resolve ONS dataset version: ${err instanceof Error ? err.message : String(err)}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
      }
    }

    // Store the version base URL for buildRequest() to use
    const versionUrl = versionUrlCache.get(config.datasetId) ?? '';
    this._observationsUrl = `${versionUrl}/observations`;

    return super.call(req);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const headers = {
      Accept: 'application/json',
    };

    if (req.toolId === 'ons.datasets.list') {
      const params = req.params as Record<string, unknown>;
      const limit = Math.min(Number(params.limit) || 20, 50);
      const offset = Number(params.offset) || 0;
      return {
        url: `${ONS_BASE}/datasets?limit=${limit}&offset=${offset}`,
        method: 'GET',
        headers,
      };
    }

    // Stats tools: use the version-resolved observations URL
    const config = DATASET_CONFIG[req.toolId];
    if (!config || !this._observationsUrl) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const params = req.params as Record<string, unknown>;
    const dims = config.buildDimensions(params);
    const qs = new URLSearchParams(dims).toString();

    return {
      url: `${this._observationsUrl}?${qs}`,
      method: 'GET',
      headers,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    if (req.toolId === 'ons.datasets.list') {
      const body = raw.body as OnsDatasetListResponse;
      const params = req.params as Record<string, unknown>;
      const keyword = params.keyword ? String(params.keyword).toLowerCase() : '';

      let items = body.items ?? [];
      if (keyword) {
        items = items.filter(
          (it) =>
            it.title?.toLowerCase().includes(keyword) ||
            it.description?.toLowerCase().includes(keyword) ||
            it.keywords?.some((k) => k.toLowerCase().includes(keyword)),
        );
      }

      const result: OnsDatasetsOutput = {
        total_count: keyword ? items.length : body.total_count,
        returned: items.length,
        datasets: items.map((it) => ({
          id: it.id,
          title: it.title,
          description: it.description ?? '',
          last_updated: it.last_updated ?? '',
          release_frequency: it.release_frequency ?? '',
          state: it.state ?? '',
          national_statistic: it.national_statistic ?? false,
        })),
      };
      return result;
    }

    // Stats observations response
    const body = raw.body as OnsObservationsResponse;
    const config = DATASET_CONFIG[req.toolId];
    const params = req.params as Record<string, unknown>;
    const limit = Math.min(Number(params.limit) || 60, 300);

    const obs = body.observations ?? [];
    // Sort by time label — ONS returns them in arbitrary order
    const sorted = [...obs].sort((a, b) => {
      const ta = a.dimensions?.Time?.label ?? a.dimensions?.time?.label ?? '';
      const tb = b.dimensions?.Time?.label ?? b.dimensions?.time?.label ?? '';
      return ta.localeCompare(tb);
    });

    // Return the most recent `limit` observations
    const tail = sorted.slice(-limit);

    const records = tail.map((o) => {
      const period = o.dimensions?.Time?.label ?? o.dimensions?.time?.label ?? '';
      const val = o.observation != null ? parseFloat(o.observation) : null;
      return { period, value: isNaN(val as number) ? null : val };
    });

    const latest = records[records.length - 1];

    const output: OnsStatsOutput = {
      dataset_id: config?.datasetId ?? req.toolId,
      title: config?.title ?? req.toolId,
      unit: body.unit_of_measure ?? config?.unit ?? '',
      latest_period: latest?.period ?? '',
      latest_value: latest?.value ?? null,
      total_observations: body.total_observations ?? obs.length,
      returned_observations: records.length,
      records,
    };
    return output;
  }
}
