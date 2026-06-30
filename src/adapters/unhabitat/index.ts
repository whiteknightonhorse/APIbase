import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ArcGisResponse,
  TransportAccessRecord,
  LandConsumptionRecord,
  OpenSpacesRecord,
  CityBudgetRecord,
} from './types';

const ARCGIS_BASE = 'https://services6.arcgis.com/uWtJiVzcBsV6C7NV/arcgis/rest/services';

const SERVICES = {
  transport: '11_2_1_Percentage_Access_to_Public_Transport/FeatureServer/0/query',
  land: '11_3_1_Land_Consumption_Rates_1990_2000_and_2015/FeatureServer/0/query',
  openspaces: '11_7_1_provision_and_access_to_open_spaces_in_cities_2020/FeatureServer/0/query',
  citybudget: 'Global_Municipal_Database/FeatureServer/0/query',
} as const;

/**
 * UN-Habitat Urban Indicators Database adapter (UC-548).
 *
 * Wraps ArcGIS Feature Services hosted by UN-Habitat (services6.arcgis.com).
 * All endpoints are public domain, no auth required.
 *
 * Tools:
 *   unhabitat.transport_access → SDG 11.2.1 public transport access by city
 *   unhabitat.land_consumption → SDG 11.3.1 land consumption vs population growth
 *   unhabitat.open_spaces      → SDG 11.7.1 urban open space share by city
 *   unhabitat.city_budget      → Global Municipal Database city budget data
 */
export class UnhabitatAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'unhabitat',
      baseUrl: ARCGIS_BASE,
      timeoutMs: 15_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const limit = Math.min(Number(p.limit ?? 50), 100);

    switch (req.toolId) {
      case 'unhabitat.transport_access':
        return this.buildQuery(SERVICES.transport, p, limit, headers, [
          'Country',
          'Cities',
          'Region',
        ]);

      case 'unhabitat.land_consumption':
        return this.buildQuery(SERVICES.land, p, limit, headers, ['Country', 'Cities', 'Region']);

      case 'unhabitat.open_spaces':
        return this.buildQuery(SERVICES.openspaces, p, limit, headers, [
          'Country',
          'City',
          'Region',
        ]);

      case 'unhabitat.city_budget':
        return this.buildQuery(SERVICES.citybudget, p, limit, headers, [
          'COUNTRY',
          'City',
          'Region',
        ]);

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

  private buildQuery(
    service: string,
    p: Record<string, unknown>,
    limit: number,
    headers: Record<string, string>,
    countryField: [string, string, string],
  ): { url: string; method: string; headers: Record<string, string> } {
    const [cf, cityField, regionField] = countryField;
    const clauses: string[] = [];

    if (p.country) {
      clauses.push(`UPPER(${cf}) LIKE UPPER('${this.escape(String(p.country))}%')`);
    }
    if (p.city) {
      clauses.push(`UPPER(${cityField}) LIKE UPPER('%${this.escape(String(p.city))}%')`);
    }
    if (p.region) {
      clauses.push(`UPPER(${regionField}) LIKE UPPER('%${this.escape(String(p.region))}%')`);
    }

    const where = clauses.length > 0 ? clauses.join(' AND ') : '1=1';
    const qs = new URLSearchParams({
      where,
      outFields: '*',
      f: 'json',
      resultRecordCount: String(limit),
    });

    return {
      url: `${ARCGIS_BASE}/${service}?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    if ('error' in body && body.error) {
      const err = body.error as { message?: string; code?: number };
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `ArcGIS error: ${err.message ?? JSON.stringify(err)}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    switch (req.toolId) {
      case 'unhabitat.transport_access':
        return this.parseTransport(body as unknown as ArcGisResponse<TransportAccessRecord>);
      case 'unhabitat.land_consumption':
        return this.parseLand(body as unknown as ArcGisResponse<LandConsumptionRecord>);
      case 'unhabitat.open_spaces':
        return this.parseOpenSpaces(body as unknown as ArcGisResponse<OpenSpacesRecord>);
      case 'unhabitat.city_budget':
        return this.parseCityBudget(body as unknown as ArcGisResponse<CityBudgetRecord>);
      default:
        return body;
    }
  }

  private parseTransport(data: ArcGisResponse<TransportAccessRecord>): unknown {
    const features = data.features ?? [];
    return {
      indicator: 'SDG 11.2.1',
      description: 'Proportion of population with convenient access to public transport',
      count: features.length,
      cities: features.map((f) => ({
        city: f.attributes.Cities,
        country: f.attributes.Country,
        region: (f.attributes.Region ?? '').trim(),
        access_pct: f.attributes.Percentage_Value,
        source: f.attributes.Estimate_source,
      })),
    };
  }

  private parseLand(data: ArcGisResponse<LandConsumptionRecord>): unknown {
    const features = data.features ?? [];
    return {
      indicator: 'SDG 11.3.1',
      description:
        'Land consumption rate relative to population growth rate (ratio < 1 = efficient growth)',
      count: features.length,
      cities: features.map((f) => ({
        city: f.attributes.Cities,
        country: f.attributes.Country,
        region: (f.attributes.Region ?? '').trim(),
        land_consumption_rate_1990_2000: f.attributes.LCR_1990_to_2000,
        land_consumption_rate_2000_2015: f.attributes.LCR_2000_to_2015,
        population_growth_rate_1990_2000: f.attributes.PGR_1990_to_2000,
        population_growth_rate_2000_2015: f.attributes.PGR_2000_to_2015,
        lcr_pgr_ratio_1990_2000: f.attributes.LCRPGR_1990_to_2000,
        lcr_pgr_ratio_2000_2015: f.attributes.LCRPGR_2000_to_2015,
        built_up_area_m2_per_capita_1990: f.attributes.BUP_area_per_Capita_1990,
        built_up_area_m2_per_capita_2000: f.attributes.BUP_area_per_Capita_2000,
        built_up_area_m2_per_capita_2015: f.attributes.BUP_area_per_Capita_2015,
        source: f.attributes.Estimate_source,
      })),
    };
  }

  private parseOpenSpaces(data: ArcGisResponse<OpenSpacesRecord>): unknown {
    const features = data.features ?? [];
    return {
      indicator: 'SDG 11.7.1',
      description:
        'Average share of built-up urban area that is open public space (parks, plazas, streets)',
      count: features.length,
      cities: features.map((f) => ({
        city: f.attributes.City,
        country: f.attributes.Country,
        region: (f.attributes.Region ?? '').trim(),
        year: f.attributes.Estimate_Year,
        open_public_space_pct: f.attributes.Urban_Share_in_OPS,
        streets_pct: f.attributes.Urban_Share_in_Streets,
        total_open_and_streets_pct: f.attributes.Urban_Share_in_OPS_and_Streets,
        population_with_ops_access: f.attributes.Population_with_OPS_access,
        source: f.attributes.Estimate_Source,
      })),
    };
  }

  private parseCityBudget(data: ArcGisResponse<CityBudgetRecord>): unknown {
    const features = data.features ?? [];
    return {
      dataset: 'Global Municipal Database',
      description:
        'City-level municipal budget and expenditure data across education, health, transport, and more',
      count: features.length,
      cities: features.map((f) => ({
        city: f.attributes.City || f.attributes.NAME,
        country: f.attributes.COUNTRY,
        region: f.attributes.Region,
        income_group: f.attributes.Country_in,
        year: f.attributes.Year,
        population: f.attributes.Population,
        total_budget_usd: f.attributes.Total_Bu_2,
        budget_per_capita_usd: f.attributes.PerCapBudg,
        capital_expenditure_usd: f.attributes.Capital__1,
        own_source_revenue_usd: f.attributes.TotalOwnSo,
        own_source_revenue_per_capita_usd: f.attributes.PC_OwnSour,
        expenditure_pct: {
          streets: f.attributes.Streets,
          buildings: f.attributes.Building,
          sanitation: f.attributes.Sanitati_1,
          solid_waste: f.attributes.Solid_Wa_1,
          water: f.attributes.Water,
          energy: f.attributes.Energy,
          education: f.attributes.Educatio_1,
          health: f.attributes.Health,
          public_transport: f.attributes.PublicTran,
        },
      })),
    };
  }
}
