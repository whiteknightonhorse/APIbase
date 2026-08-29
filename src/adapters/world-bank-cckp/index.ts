import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { CckpResponse } from './types';

const CCKP_BASE = 'https://cckpapi.worldbank.org/cckp/v1';

const CORE_VARIABLES = new Set(['tas', 'tasmax', 'tasmin', 'pr']);
const EXTREME_INDICES = new Set(['hd35', 'hd40', 'fd', 'cdd', 'cwd', 'r20mm', 'tr23']);
const SCENARIOS = new Set(['ssp126', 'ssp245', 'ssp370', 'ssp585']);
const PERIODS = new Set(['2020-2039', '2040-2059', '2060-2079', '2080-2099']);
const AGGREGATIONS = new Set(['annual', 'monthly', 'seasonal']);

/**
 * World Bank Climate Change Knowledge Portal (CCKP) public REST API adapter (UC-630).
 *
 * cckpapi.worldbank.org exposes CMIP6 climate model output (historical baseline climatology
 * and future SSP-scenario projections) plus derived extreme-climate indices, keyed by a fixed
 * 11-segment underscore code: {collection}_{type}_{variable}_{product}_{aggregation}_{period}_
 * {percentile}_{scenario}_{model}_{model-calc}_{statistic}, e.g.
 *   cmip6-x0.25_climatology_tas_climatology_annual_1995-2014_median_historical_ensemble_all_mean
 * All three tools share this code shape and differ only in variable/scenario/period. No auth,
 * public domain (World Bank open data).
 *   world-bank-cckp.climate_normal     -> historical baseline (1995-2014), median, ensemble mean
 *   world-bank-cckp.climate_projection -> CMIP6 SSP scenario projection for a future period
 *   world-bank-cckp.extreme_indices    -> derived extreme-climate index, historical or projected
 */
export class WorldBankCckpAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'world-bank-cckp', baseUrl: CCKP_BASE, maxResponseBytes: 2_000_000 });
  }

  private buildCode(
    variable: string,
    aggregation: string,
    period: string,
    scenario: string,
  ): string {
    return `cmip6-x0.25_climatology_${variable}_climatology_${aggregation}_${period}_median_${scenario}_ensemble_all_mean`;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const country = String(params.country || '').trim();
    if (!country) {
      throw this.invalidInput(req.toolId, 'country is required');
    }
    const aggregation = String(params.aggregation || 'annual').trim();
    if (!AGGREGATIONS.has(aggregation)) {
      throw this.invalidInput(
        req.toolId,
        `aggregation must be one of: ${[...AGGREGATIONS].join(', ')}`,
      );
    }

    switch (req.toolId) {
      case 'world-bank-cckp.climate_normal': {
        const variable = String(params.variable || '').trim();
        if (!CORE_VARIABLES.has(variable)) {
          throw this.invalidInput(
            req.toolId,
            `variable must be one of: ${[...CORE_VARIABLES].join(', ')}`,
          );
        }
        const code = this.buildCode(variable, aggregation, '1995-2014', 'historical');
        return {
          url: `${CCKP_BASE}/${code}/${encodeURIComponent(country)}?_format=json`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'world-bank-cckp.climate_projection': {
        const variable = String(params.variable || '').trim();
        if (!CORE_VARIABLES.has(variable)) {
          throw this.invalidInput(
            req.toolId,
            `variable must be one of: ${[...CORE_VARIABLES].join(', ')}`,
          );
        }
        const scenario = String(params.scenario || '').trim();
        if (!SCENARIOS.has(scenario)) {
          throw this.invalidInput(
            req.toolId,
            `scenario must be one of: ${[...SCENARIOS].join(', ')}`,
          );
        }
        const period = String(params.period || '2040-2059').trim();
        if (!PERIODS.has(period)) {
          throw this.invalidInput(req.toolId, `period must be one of: ${[...PERIODS].join(', ')}`);
        }
        const code = this.buildCode(variable, aggregation, period, scenario);
        return {
          url: `${CCKP_BASE}/${code}/${encodeURIComponent(country)}?_format=json`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'world-bank-cckp.extreme_indices': {
        const index = String(params.index || '').trim();
        if (!EXTREME_INDICES.has(index)) {
          throw this.invalidInput(
            req.toolId,
            `index must be one of: ${[...EXTREME_INDICES].join(', ')}`,
          );
        }
        const scenario = String(params.scenario || 'historical').trim();
        let period: string;
        if (scenario === 'historical') {
          period = '1995-2014';
        } else {
          if (!SCENARIOS.has(scenario)) {
            throw this.invalidInput(
              req.toolId,
              `scenario must be "historical" or one of: ${[...SCENARIOS].join(', ')}`,
            );
          }
          period = String(params.period || '2040-2059').trim();
          if (!PERIODS.has(period)) {
            throw this.invalidInput(
              req.toolId,
              `period must be one of: ${[...PERIODS].join(', ')}`,
            );
          }
        }
        const code = this.buildCode(index, aggregation, period, scenario);
        return {
          url: `${CCKP_BASE}/${code}/${encodeURIComponent(country)}?_format=json`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
    const body = raw.body as CckpResponse;
    const country = String(params.country || '').trim();
    const dataByGeo = Array.isArray(body.data) ? {} : body.data;
    const series = dataByGeo[country] ?? {};
    const observations = Object.entries(series)
      .map(([period, value]) => ({ period, value }))
      .sort((a, b) => a.period.localeCompare(b.period));

    switch (req.toolId) {
      case 'world-bank-cckp.climate_normal':
        return {
          variable: params.variable,
          country,
          baseline: '1995-2014',
          aggregation: params.aggregation || 'annual',
          observations,
        };

      case 'world-bank-cckp.climate_projection':
        return {
          variable: params.variable,
          country,
          scenario: params.scenario,
          period: params.period || '2040-2059',
          aggregation: params.aggregation || 'annual',
          observations,
        };

      case 'world-bank-cckp.extreme_indices': {
        const scenario = params.scenario || 'historical';
        return {
          index: params.index,
          country,
          scenario,
          period: scenario === 'historical' ? '1995-2014' : params.period || '2040-2059',
          aggregation: params.aggregation || 'annual',
          observations,
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
