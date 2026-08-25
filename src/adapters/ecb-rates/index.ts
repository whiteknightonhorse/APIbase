import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SdmxJsonResponse, EcbSeriesOutput, EcbSeriesPoint } from './types';

const ECB_BASE = 'https://data-api.ecb.europa.eu/service';

const KEY_RATE_SERIES: Record<string, string> = {
  main_refinancing: 'FM/D.U2.EUR.4F.KR.MRR_FR.LEV',
  deposit_facility: 'FM/D.U2.EUR.4F.KR.DFR.LEV',
  marginal_lending: 'FM/D.U2.EUR.4F.KR.MLFR.LEV',
};

const YIELD_TENOR_SERIES: Record<string, string> = {
  '1': 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_1Y',
  '5': 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_5Y',
  '10': 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y',
  '30': 'YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_30Y',
};

const HICP_SERIES = 'ICP/M.U2.N.000000.4.ANR';
const M3_SERIES = 'BSI/M.U2.Y.V.M30.X.1.U2.2300.Z01.E';

/**
 * ECB Data Portal adapter (UC-595).
 *
 * Official ECB Statistical Data Warehouse (SDMX-JSON), distinct from the
 * Frankfurter-mirrored finance.ecb_rates exchange-rate tool (UC-016).
 * No auth, unlimited, public statistical time series:
 *   ecb-rates.key_rates       -> FM dataflow (deposit facility / MRO / marginal lending)
 *   ecb-rates.hicp_inflation  -> ICP dataflow (euro area HICP annual rate of change)
 *   ecb-rates.money_supply    -> BSI dataflow (M3 monetary aggregate, outstanding stock)
 *   ecb-rates.yield_curve     -> YC dataflow (euro area AAA government bond spot rate)
 */
export class EcbRatesAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ecb-rates', baseUrl: ECB_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ecb-rates.key_rates': {
        const rateType = String(params.rate_type || 'deposit_facility');
        const seriesPath = KEY_RATE_SERIES[rateType];
        if (!seriesPath) {
          throw this.invalidInput(req.toolId, `Unknown rate_type: ${rateType}`);
        }
        return { url: this.buildSeriesUrl(seriesPath, params), method: 'GET', headers };
      }

      case 'ecb-rates.hicp_inflation':
        return { url: this.buildSeriesUrl(HICP_SERIES, params), method: 'GET', headers };

      case 'ecb-rates.money_supply':
        return { url: this.buildSeriesUrl(M3_SERIES, params), method: 'GET', headers };

      case 'ecb-rates.yield_curve': {
        const tenor = String(params.tenor_years || '10');
        const seriesPath = YIELD_TENOR_SERIES[tenor];
        if (!seriesPath) {
          throw this.invalidInput(req.toolId, `Unknown tenor_years: ${tenor}`);
        }
        return { url: this.buildSeriesUrl(seriesPath, params), method: 'GET', headers };
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

  protected parseResponse(raw: ProviderRawResponse, _req: ProviderRequest): unknown {
    const body = raw.body as SdmxJsonResponse;
    const dataSet = body.dataSets?.[0];
    const seriesMap = dataSet?.series ?? {};
    const seriesKeys = Object.keys(seriesMap);
    if (seriesKeys.length === 0) {
      throw new Error('No series returned by ECB Data Portal for this query');
    }

    const seriesKey = seriesKeys[0];
    const timeValues = body.structure?.dimensions?.observation?.[0]?.values ?? [];
    const observationsRaw = seriesMap[seriesKey].observations ?? {};

    const observations: EcbSeriesPoint[] = Object.entries(observationsRaw)
      .map(([idx, obs]): EcbSeriesPoint => {
        const i = Number(idx);
        const period = timeValues[i]?.id ?? String(i);
        const value = obs[0];
        return { period, value: typeof value === 'number' ? value : null };
      })
      .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));

    const output: EcbSeriesOutput = {
      dataset_name: body.structure?.name ?? '',
      series_key: seriesKey,
      observations,
    };
    return output;
  }

  private buildSeriesUrl(seriesPath: string, params: Record<string, unknown>): string {
    const qs = new URLSearchParams();
    qs.set('format', 'jsondata');

    if (params.last_n_observations) {
      qs.set('lastNObservations', String(Math.min(Number(params.last_n_observations) || 10, 100)));
    } else {
      if (params.start_period) qs.set('startPeriod', String(params.start_period));
      if (params.end_period) qs.set('endPeriod', String(params.end_period));
      if (!params.start_period && !params.end_period) {
        qs.set('lastNObservations', '10');
      }
    }

    return `${ECB_BASE}/data/${seriesPath}?${qs.toString()}`;
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
