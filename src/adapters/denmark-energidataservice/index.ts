import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  EdsSpotPricesResponse,
  EdsCo2EmisResponse,
  EdsProductionConsumptionResponse,
  EdsSpotPricesOutput,
  EdsCo2EmissionsOutput,
  EdsProductionConsumptionOutput,
} from './types';

const EDS_BASE = 'https://api.energidataservice.dk/dataset';

/** toolId -> upstream dataset name + its default sort column (newest-first). */
const DATASET_MAP: Record<string, { dataset: string; sortColumn: string }> = {
  'denmark-energidataservice.spot_prices': { dataset: 'Elspotprices', sortColumn: 'HourUTC' },
  'denmark-energidataservice.co2_emissions': { dataset: 'CO2Emis', sortColumn: 'Minutes5UTC' },
  'denmark-energidataservice.production_consumption': {
    dataset: 'ProductionConsumptionSettlement',
    sortColumn: 'HourUTC',
  },
};

/**
 * Danish Energy Data Service API adapter (UC-677).
 *
 * Supported tools:
 *   denmark-energidataservice.spot_prices              -> /dataset/Elspotprices
 *     Hourly day-ahead electricity spot prices per Nordic/European bidding zone.
 *   denmark-energidataservice.co2_emissions            -> /dataset/CO2Emis
 *     5-minute-resolution CO2 intensity of the Danish electricity grid.
 *   denmark-energidataservice.production_consumption   -> /dataset/ProductionConsumptionSettlement
 *     Hourly electricity production mix (wind/solar/hydro/central) and gross consumption.
 *
 * Auth: none. Data: Energinet (Danish TSO), free public dataset API. No API key,
 * no registration. Shared-pool rate limiting observed (HTTP 429 with a
 * Retry-After-style message) — callers should back off on 429.
 * Docs: https://www.energidataservice.dk/guides/api-guides
 */
export class DenmarkEnergidataserviceAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'denmark-energidataservice', baseUrl: EDS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    const entry = DATASET_MAP[req.toolId];
    if (!entry) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const limit = Math.min(Math.max(Number(params.limit) || 24, 1), 200);
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    qs.set('sort', `${entry.sortColumn} DESC`);

    const priceArea = typeof params.price_area === 'string' ? params.price_area.trim() : '';
    if (priceArea) {
      qs.set('filter', JSON.stringify({ PriceArea: priceArea.toUpperCase() }));
    }

    const startDate = typeof params.start_date === 'string' ? params.start_date.trim() : '';
    if (startDate) qs.set('start', startDate);

    const endDate = typeof params.end_date === 'string' ? params.end_date.trim() : '';
    if (endDate) qs.set('end', endDate);

    return {
      url: `${EDS_BASE}/${entry.dataset}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'denmark-energidataservice.spot_prices':
        return this.parseSpotPrices(raw.body as EdsSpotPricesResponse);
      case 'denmark-energidataservice.co2_emissions':
        return this.parseCo2Emissions(raw.body as EdsCo2EmisResponse);
      case 'denmark-energidataservice.production_consumption':
        return this.parseProductionConsumption(raw.body as EdsProductionConsumptionResponse);
      default:
        return raw.body;
    }
  }

  private parseSpotPrices(data: EdsSpotPricesResponse): EdsSpotPricesOutput {
    const records = Array.isArray(data?.records) ? data.records : [];
    return {
      count: records.length,
      prices: records.map((r) => ({
        hour_utc: r.HourUTC,
        hour_dk: r.HourDK,
        price_area: r.PriceArea,
        spot_price_dkk_per_mwh: r.SpotPriceDKK ?? null,
        spot_price_eur_per_mwh: r.SpotPriceEUR ?? null,
      })),
    };
  }

  private parseCo2Emissions(data: EdsCo2EmisResponse): EdsCo2EmissionsOutput {
    const records = Array.isArray(data?.records) ? data.records : [];
    return {
      count: records.length,
      readings: records.map((r) => ({
        timestamp_utc: r.Minutes5UTC,
        timestamp_dk: r.Minutes5DK,
        price_area: r.PriceArea,
        co2_g_per_kwh: r.CO2Emission ?? null,
      })),
    };
  }

  private parseProductionConsumption(
    data: EdsProductionConsumptionResponse,
  ): EdsProductionConsumptionOutput {
    const records = Array.isArray(data?.records) ? data.records : [];
    return {
      count: records.length,
      records: records.map((r) => ({
        hour_utc: r.HourUTC,
        hour_dk: r.HourDK,
        price_area: r.PriceArea,
        central_power_mwh: r.CentralPowerMWh ?? null,
        local_power_mwh: r.LocalPowerMWh ?? null,
        offshore_wind_mwh: sumOrNull(r.OffshoreWindLt100MW_MWh, r.OffshoreWindGe100MW_MWh),
        onshore_wind_mwh: sumOrNull(r.OnshoreWindLt50kW_MWh, r.OnshoreWindGe50kW_MWh),
        hydro_power_mwh: r.HydroPowerMWh ?? null,
        solar_power_mwh: sumOrNull(
          r.SolarPowerLt10kW_MWh,
          r.SolarPowerGe10Lt40kW_MWh,
          r.SolarPowerGe40kW_MWh,
        ),
        gross_consumption_mwh: r.GrossConsumptionMWh ?? null,
      })),
    };
  }
}

/** Sums numeric parts, treating null/undefined as 0; returns null only if all parts are null/undefined. */
function sumOrNull(...parts: Array<number | null | undefined>): number | null {
  const present = parts.filter((p): p is number => p !== null && p !== undefined);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}
