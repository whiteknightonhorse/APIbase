import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CommunityLocationsResponse,
  BlockGroupMetricsResponse,
  CommunitySummaryStatsResponse,
} from './types';

const ENVIROATLAS_BASE = 'https://enviroatlas.epa.gov/arcgis/rest/services';
const BGMETRICS_LAYER = `${ENVIROATLAS_BASE}/Communities/Community_BGmetrics/MapServer/2/query`;
const COMMUNITIES_LAYER = `${ENVIROATLAS_BASE}/Communities/Community_Locations/MapServer/0/query`;

// Static reference of EPA EnviroAtlas's 32 pilot communities (CommST code -> name),
// used only to resolve a human-supplied community name/code into the exact CommST
// value the upstream API expects — the actual data returned to callers always comes
// from a live upstream query, never from this table. The pilot-community dataset is
// a completed EPA project and has not changed since its 2018 publication.
const PILOT_COMMUNITIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'DMIA', name: 'Des Moines, IA' },
  { code: 'DNC', name: 'Durham, NC' },
  { code: 'FCA', name: 'Fresno, CA' },
  { code: 'GBWI', name: 'Green Bay, WI' },
  { code: 'MWI', name: 'Milwaukee, WI' },
  { code: 'NBMA', name: 'New Bedford, MA' },
  { code: 'PAZ', name: 'Phoenix, AZ' },
  { code: 'PitPA', name: 'Pittsburgh, PA' },
  { code: 'PME', name: 'Portland, ME' },
  { code: 'PNJ', name: 'Paterson, NJ' },
  { code: 'POR', name: 'Portland, OR' },
  { code: 'TFL', name: 'Tampa, FL' },
  { code: 'WIA', name: 'Woodbine, IA' },
  { code: 'NYNY', name: 'New York, NY' },
  { code: 'ATX', name: 'Austin, TX' },
  { code: 'MTN', name: 'Memphis, TN' },
  { code: 'CleOH', name: 'Cleveland, OH' },
  { code: 'MSPMN', name: 'Minneapolis/St. Paul, MN' },
  { code: 'NHCT', name: 'New Haven, CT' },
  { code: 'BirAL', name: 'Birmingham, AL' },
  { code: 'BMD', name: 'Baltimore, MD' },
  { code: 'BTX', name: 'Brownsville, TX' },
  { code: 'VBWVA', name: 'Virginia Beach/Williamsburg, VA' },
  { code: 'CIL', name: 'Chicago, IL' },
  { code: 'SLCUT', name: 'Salt Lake City, UT' },
  { code: 'PhiPA', name: 'Philadelphia, PA' },
  { code: 'SonCA', name: 'Sonoma County, CA' },
  { code: 'WDC', name: 'Washington, DC' },
  { code: 'LACA', name: 'Los Angeles, CA' },
  { code: 'SLMO', name: 'St. Louis, MO' },
  { code: 'SDCA', name: 'San Diego, CA' },
  { code: 'TacWA', name: 'Tacoma, WA' },
];

const BG_METRICS_OUT_FIELDS = [
  'GEOID10',
  'Community',
  'CommST',
  'SUM_POP10',
  'NonWt_Pct',
  'PLx2_Pct',
  'MFor_P',
  'Imp_P',
  'Green_P',
  'Ag_P',
  'Wet_P',
  'KGCSTOR',
  'KGCSEQ',
  'DOLCSTOR',
  'DOLCSEQ',
  'CORemoval',
  'NO2Removal',
  'O3Removal',
  'PM25Remova',
  'SO2Removal',
  'PM10Remova',
  'maxtempreduction',
  'maxtempreductionnight',
  'FP1_Pop_P',
  'FP02_Pop_P',
  'IWDP_Pct',
  'WVT_Pct',
  'WVW_Pct',
  'Runoff',
  'TSSmed',
  'TPmed',
].join(',');

const COMMUNITY_SUMMARY_STATISTICS = JSON.stringify([
  { statisticType: 'avg', onStatisticField: 'MFor_P', outStatisticFieldName: 'avg_tree_cover_pct' },
  { statisticType: 'avg', onStatisticField: 'Imp_P', outStatisticFieldName: 'avg_impervious_pct' },
  {
    statisticType: 'avg',
    onStatisticField: 'Green_P',
    outStatisticFieldName: 'avg_green_space_pct',
  },
  {
    statisticType: 'sum',
    onStatisticField: 'SUM_POP10',
    outStatisticFieldName: 'total_population',
  },
  {
    statisticType: 'sum',
    onStatisticField: 'KGCSTOR',
    outStatisticFieldName: 'total_carbon_stored_kg',
  },
  {
    statisticType: 'sum',
    onStatisticField: 'DOLCSTOR',
    outStatisticFieldName: 'total_carbon_stored_usd',
  },
  {
    statisticType: 'sum',
    onStatisticField: 'DOLCSEQ',
    outStatisticFieldName: 'annual_carbon_sequestration_value_usd',
  },
  {
    statisticType: 'avg',
    onStatisticField: 'FP1_Pop_P',
    outStatisticFieldName: 'avg_flood_risk_pop_pct',
  },
  {
    statisticType: 'count',
    onStatisticField: 'GEOID10',
    outStatisticFieldName: 'block_group_count',
  },
]);

/**
 * EPA EnviroAtlas adapter (UC-604).
 *
 * EPA's community-scale ecosystem-services and environmental-health mapping
 * platform, published as ArcGIS REST services at enviroatlas.epa.gov — no
 * auth, no documented rate limit. Coverage is limited to 32 EPA pilot
 * communities (block-group resolution), not nationwide.
 *   enviroatlas.communities          -> GET Community_Locations/MapServer/0/query
 *   enviroatlas.block_group_metrics  -> GET Community_BGmetrics/MapServer/2/query (point-in-polygon)
 *   enviroatlas.community_summary    -> GET Community_BGmetrics/MapServer/2/query (outStatistics)
 */
export class EnviroatlasAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'enviroatlas', baseUrl: ENVIROATLAS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'enviroatlas.communities': {
        const qs = new URLSearchParams({
          where: '1=1',
          outFields: 'Community,CommST,BG_Count',
          returnGeometry: 'false',
          f: 'json',
        });
        return { url: `${COMMUNITIES_LAYER}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'enviroatlas.block_group_metrics': {
        const lat = Number(params.lat);
        const lon = Number(params.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          throw this.invalidInput(req.toolId, 'lat and lon must be numbers');
        }
        const qs = new URLSearchParams({
          geometry: `${lon},${lat}`,
          geometryType: 'esriGeometryPoint',
          inSR: '4326',
          spatialRel: 'esriSpatialRelIntersects',
          outFields: BG_METRICS_OUT_FIELDS,
          returnGeometry: 'false',
          f: 'json',
        });
        return { url: `${BGMETRICS_LAYER}?${qs.toString()}`, method: 'GET', headers };
      }

      case 'enviroatlas.community_summary': {
        const code = this.resolveCommunityCode(String(params.community || '').trim());
        if (!code) {
          throw this.invalidInput(
            req.toolId,
            `Unknown community "${String(params.community || '')}". Call enviroatlas.communities first to see the 32 covered communities.`,
          );
        }
        const qs = new URLSearchParams({
          where: `CommST='${code}'`,
          outStatistics: COMMUNITY_SUMMARY_STATISTICS,
          f: 'json',
        });
        return { url: `${BGMETRICS_LAYER}?${qs.toString()}`, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'enviroatlas.communities': {
        const body = raw.body as CommunityLocationsResponse;
        return {
          total: body.features?.length ?? 0,
          communities: (body.features ?? []).map((f) => ({
            code: f.attributes.CommST,
            name: f.attributes.Community,
            block_group_count: f.attributes.BG_Count,
          })),
        };
      }

      case 'enviroatlas.block_group_metrics': {
        const body = raw.body as BlockGroupMetricsResponse;
        const feature = body.features?.[0];
        if (!feature) {
          return {
            covered: false,
            message:
              'No EnviroAtlas block-group data at this location — it falls outside the 32 EPA pilot communities.',
          };
        }
        const a = feature.attributes;
        return {
          covered: true,
          block_group_id: a.GEOID10,
          community: a.Community,
          community_code: a.CommST,
          population: a.SUM_POP10,
          non_white_pct: a.NonWt_Pct,
          low_income_pct: a.PLx2_Pct,
          tree_cover_pct: a.MFor_P,
          impervious_area_pct: a.Imp_P,
          green_space_pct: a.Green_P,
          agricultural_land_pct: a.Ag_P,
          wetlands_pct: a.Wet_P,
          carbon_stored_kg: a.KGCSTOR,
          carbon_sequestered_kg_per_yr: a.KGCSEQ,
          carbon_stored_usd: a.DOLCSTOR,
          carbon_sequestration_value_usd_per_yr: a.DOLCSEQ,
          air_pollutant_removal_kg_per_yr: {
            carbon_monoxide: a.CORemoval,
            nitrogen_dioxide: a.NO2Removal,
            ozone: a.O3Removal,
            pm25: a.PM25Remova,
            sulfur_dioxide: a.SO2Removal,
            pm10: a.PM10Remova,
          },
          daytime_temp_reduction_celsius: a.maxtempreduction,
          nighttime_temp_reduction_celsius: a.maxtempreductionnight,
          flood_risk_population_pct: {
            annual_chance_1pct: a.FP1_Pop_P,
            annual_chance_02pct: a.FP02_Pop_P,
          },
          population_within_500m_of_park_pct: a.IWDP_Pct,
          population_with_minimal_tree_views_pct: a.WVT_Pct,
          population_with_water_views_pct: a.WVW_Pct,
          stormwater_runoff_reduction_m3_per_yr: a.Runoff,
          suspended_solids_reduction_kg_per_yr: a.TSSmed,
          phosphorus_reduction_kg_per_yr: a.TPmed,
        };
      }

      case 'enviroatlas.community_summary': {
        const body = raw.body as CommunitySummaryStatsResponse;
        const stats = body.features?.[0]?.attributes;
        if (!stats || stats.block_group_count === null || stats.block_group_count === 0) {
          return { found: false, message: 'No block-group data found for this community.' };
        }
        return {
          found: true,
          block_group_count: stats.block_group_count,
          total_population: stats.total_population,
          avg_tree_cover_pct: stats.avg_tree_cover_pct,
          avg_impervious_area_pct: stats.avg_impervious_pct,
          avg_green_space_pct: stats.avg_green_space_pct,
          total_carbon_stored_kg: stats.total_carbon_stored_kg,
          total_carbon_stored_usd: stats.total_carbon_stored_usd,
          annual_carbon_sequestration_value_usd: stats.annual_carbon_sequestration_value_usd,
          avg_population_pct_in_1pct_flood_zone: stats.avg_flood_risk_pop_pct,
        };
      }

      default:
        return raw.body;
    }
  }

  private resolveCommunityCode(input: string): string | null {
    if (!input) return null;
    const byCode = PILOT_COMMUNITIES.find((c) => c.code.toLowerCase() === input.toLowerCase());
    if (byCode) return byCode.code;
    const byName = PILOT_COMMUNITIES.find((c) => c.name.toLowerCase() === input.toLowerCase());
    if (byName) return byName.code;
    const bySubstring = PILOT_COMMUNITIES.find((c) =>
      c.name.toLowerCase().includes(input.toLowerCase()),
    );
    return bySubstring ? bySubstring.code : null;
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
