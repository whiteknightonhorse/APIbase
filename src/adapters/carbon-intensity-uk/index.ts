import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CurrentIntensityResponse,
  GenerationMixResponse,
  RegionalResponse,
  ForecastResponse,
} from './types';

/**
 * UK National Grid Carbon Intensity API adapter (UC-513).
 *
 * Supported tools (read-only):
 *   carbonintensity.current    → GET /intensity
 *   carbonintensity.generation → GET /generation
 *   carbonintensity.regional   → GET /regional
 *   carbonintensity.forecast   → GET /intensity/fw24h
 *
 * Auth: None (CC BY 4.0, UK National Grid ESO)
 */
export class CarbonIntensityUkAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'carbon-intensity-uk',
      baseUrl: 'https://api.carbonintensity.org.uk',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'carbonintensity.current':
        return { url: `${this.baseUrl}/intensity`, method: 'GET', headers };

      case 'carbonintensity.generation':
        return { url: `${this.baseUrl}/generation`, method: 'GET', headers };

      case 'carbonintensity.regional': {
        const params = req.params as Record<string, unknown>;
        const regionId = params.region_id !== undefined ? String(params.region_id) : null;
        const url = regionId
          ? `${this.baseUrl}/regional/regionid/${encodeURIComponent(regionId)}`
          : `${this.baseUrl}/regional`;
        return { url, method: 'GET', headers };
      }

      case 'carbonintensity.forecast':
        return { url: `${this.baseUrl}/intensity/fw24h`, method: 'GET', headers };

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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'carbonintensity.current': {
        const data = (body as unknown as CurrentIntensityResponse).data;
        const period = data[0];
        return {
          from: period.from,
          to: period.to,
          forecast_gco2_kwh: period.intensity.forecast,
          actual_gco2_kwh: period.intensity.actual ?? null,
          index: period.intensity.index,
        };
      }

      case 'carbonintensity.generation': {
        const d = (body as unknown as GenerationMixResponse).data;
        const mix: Record<string, number> = {};
        for (const source of d.generationmix) {
          mix[source.fuel] = source.perc;
        }
        return {
          from: d.from,
          to: d.to,
          generation_mix_pct: mix,
        };
      }

      case 'carbonintensity.regional': {
        const params = req.params as Record<string, unknown>;
        const regionId = params.region_id !== undefined ? Number(params.region_id) : null;

        if (regionId !== null) {
          // Single region response: data[0] has {regionid, dnoregion, shortname, data: [...]}
          const raw_data = body as unknown as {
            data: Array<{
              regionid: number;
              dnoregion: string;
              shortname: string;
              data: Array<{
                from: string;
                to: string;
                intensity: { forecast: number; index: string };
                generationmix: Array<{ fuel: string; perc: number }>;
              }>;
            }>;
          };
          const region = raw_data.data[0];
          const period = region.data[0];
          const mix: Record<string, number> = {};
          for (const s of period.generationmix) {
            mix[s.fuel] = s.perc;
          }
          return {
            region_id: region.regionid,
            region_name: region.shortname,
            dno_region: region.dnoregion,
            from: period.from,
            to: period.to,
            forecast_gco2_kwh: period.intensity.forecast,
            index: period.intensity.index,
            generation_mix_pct: mix,
          };
        }

        // All regions
        const regionalData = body as unknown as RegionalResponse;
        const block = regionalData.data[0];
        return {
          from: block.from,
          to: block.to,
          regions: block.regions.map((r) => {
            const mix: Record<string, number> = {};
            for (const s of r.generationmix) {
              mix[s.fuel] = s.perc;
            }
            return {
              region_id: r.regionid,
              region_name: r.shortname,
              dno_region: r.dnoregion,
              forecast_gco2_kwh: r.intensity.forecast,
              index: r.intensity.index,
              generation_mix_pct: mix,
            };
          }),
        };
      }

      case 'carbonintensity.forecast': {
        const data = (body as unknown as ForecastResponse).data;
        return {
          periods: data.map((p) => ({
            from: p.from,
            to: p.to,
            forecast_gco2_kwh: p.intensity.forecast,
            index: p.intensity.index,
          })),
          count: data.length,
        };
      }

      default:
        return body;
    }
  }
}
