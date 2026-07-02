import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { NbiQueryResponse, NbiStatisticsResponse, NbiBridgeAttributes } from './types';

/**
 * National Bridge Inventory (NBI) adapter (UC-569).
 *
 * Supported tools (read-only):
 *   nbi.search          → ArcGIS FeatureServer query by state + condition
 *   nbi.bridge_detail   → Look up specific bridge by structure number + state
 *   nbi.nearby          → Find bridges within a bounding box of a lat/lng point
 *   nbi.condition_stats → Aggregated bridge condition counts for a state
 *
 * Auth: None — USDOT open data, public domain (FHWA 2023).
 * Base: https://geo.dot.gov/server/rest/services/Hosted/National_Bridge_Inventory/FeatureServer/0
 */
export class NbiAdapter extends BaseAdapter {
  // ArcGIS FeatureServer returns up to 2000 records per call
  private static readonly BASE =
    'https://geo.dot.gov/server/rest/services/Hosted/National_Bridge_Inventory/FeatureServer/0';

  // Fields we always request for search/nearby
  private static readonly CORE_FIELDS = [
    'state_code',
    'structure_',
    'location_0',
    'features_d',
    'facility_c',
    'county_cod',
    'year_built',
    'year_recon',
    'bridge_con',
    'deck_cond_',
    'superstruc',
    'substructu',
    'operating_',
    'max_span_l',
    'deck_width',
    'main_unit_',
    'adt_029',
    'latdd',
    'longdd',
    'open_close',
    'lowest_rat',
    'scour_crit',
    'inspect_fr',
    'date_of_in',
  ].join(',');

  constructor() {
    super({
      provider: 'nbi',
      baseUrl: NbiAdapter.BASE,
      timeoutMs: 20_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'nbi.search':
        return this.buildSearchRequest(params, headers);
      case 'nbi.bridge_detail':
        return this.buildDetailRequest(params, headers);
      case 'nbi.nearby':
        return this.buildNearbyRequest(params, headers);
      case 'nbi.condition_stats':
        return this.buildStatsRequest(params, headers);
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

    const bodyErr = (body as NbiQueryResponse).error;
    if (bodyErr) {
      throw {
        code: ProviderErrorCode.UNAVAILABLE,
        httpStatus: 502,
        message: `ArcGIS error ${bodyErr.code}: ${bodyErr.message}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    switch (req.toolId) {
      case 'nbi.search':
      case 'nbi.nearby': {
        const data = body as NbiQueryResponse;
        const bridges = (data.features ?? []).map((f) => this.formatBridge(f.attributes));
        return {
          count: bridges.length,
          exceeded_limit: data.exceededTransferLimit ?? false,
          bridges,
        };
      }
      case 'nbi.bridge_detail': {
        const data = body as NbiQueryResponse;
        if (!data.features?.length) {
          return { found: false, bridge: null };
        }
        return {
          found: true,
          bridge: this.formatDetailedBridge(data.features[0].attributes),
        };
      }
      case 'nbi.condition_stats': {
        const data = body as NbiStatisticsResponse;
        const stats: Record<string, number> = { good: 0, fair: 0, poor: 0, unknown: 0 };
        for (const f of data.features ?? []) {
          const cond = f.attributes.bridge_con?.trim();
          const count = f.attributes.count ?? 0;
          if (cond === 'G') stats.good += count;
          else if (cond === 'F') stats.fair += count;
          else if (cond === 'P') stats.poor += count;
          else stats.unknown += count;
        }
        const total = stats.good + stats.fair + stats.poor + stats.unknown;
        return {
          total,
          good: stats.good,
          fair: stats.fair,
          poor: stats.poor,
          unknown: stats.unknown,
          pct_good: total ? Math.round((stats.good / total) * 100) : 0,
          pct_fair: total ? Math.round((stats.fair / total) * 100) : 0,
          pct_poor: total ? Math.round((stats.poor / total) * 100) : 0,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------

  private buildSearchRequest(params: Record<string, unknown>, headers: Record<string, string>) {
    const stateCode = String(params.state_code ?? '').padStart(2, '0');
    const condition = params.condition as string | undefined;
    const limit = Math.min(Number(params.limit ?? 50), 200);

    const where: string[] = [`state_code='${stateCode}'`];
    if (condition && ['G', 'F', 'P'].includes(condition.toUpperCase())) {
      where.push(`bridge_con='${condition.toUpperCase()}'`);
    }

    const qs = new URLSearchParams({
      where: where.join(' AND '),
      outFields: NbiAdapter.CORE_FIELDS,
      resultRecordCount: String(limit),
      orderByFields: 'lowest_rat ASC',
      f: 'json',
    });

    return {
      url: `${NbiAdapter.BASE}/query?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDetailRequest(params: Record<string, unknown>, headers: Record<string, string>) {
    const stateCode = String(params.state_code ?? '').padStart(2, '0');
    const structureNum = String(params.structure_number ?? '').trim();

    const qs = new URLSearchParams({
      where: `state_code='${stateCode}' AND structure_='${structureNum}'`,
      outFields: '*',
      resultRecordCount: '1',
      f: 'json',
    });

    return {
      url: `${NbiAdapter.BASE}/query?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildNearbyRequest(params: Record<string, unknown>, headers: Record<string, string>) {
    const lat = Number(params.latitude);
    const lng = Number(params.longitude);
    const radiusMi = Math.min(Number(params.radius_miles ?? 10), 50);
    const limit = Math.min(Number(params.limit ?? 25), 100);

    // Convert miles to degrees (approximate: 1° lat ≈ 69 miles, 1° lng varies)
    const latDelta = radiusMi / 69;
    const lngDelta = radiusMi / (69 * Math.cos((lat * Math.PI) / 180));

    const geometry = `${lng - lngDelta},${lat - latDelta},${lng + lngDelta},${lat + latDelta}`;

    const qs = new URLSearchParams({
      geometry,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: NbiAdapter.CORE_FIELDS,
      resultRecordCount: String(limit),
      orderByFields: 'lowest_rat ASC',
      f: 'json',
    });

    return {
      url: `${NbiAdapter.BASE}/query?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildStatsRequest(params: Record<string, unknown>, headers: Record<string, string>) {
    const stateCode = String(params.state_code ?? '').padStart(2, '0');

    const outStatistics = JSON.stringify([
      { statisticType: 'count', onStatisticField: 'bridge_con', outStatisticFieldName: 'count' },
    ]);

    const qs = new URLSearchParams({
      where: `state_code='${stateCode}'`,
      outFields: 'bridge_con',
      groupByFieldsForStatistics: 'bridge_con',
      outStatistics,
      f: 'json',
    });

    return {
      url: `${NbiAdapter.BASE}/query?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------

  private formatBridge(a: NbiBridgeAttributes): Record<string, unknown> {
    return {
      structure_number: a.structure_?.trim(),
      state_code: a.state_code,
      location: a.location_0?.trim(),
      feature_below: a.features_d?.trim(),
      facility_carried: a.facility_c?.trim(),
      latitude: a.latdd,
      longitude: a.longdd,
      year_built: a.year_built || null,
      year_reconstructed: a.year_recon || null,
      condition: this.decodeCondition(a.bridge_con),
      deck_condition: this.decodeRating(a.deck_cond_),
      superstructure_condition: this.decodeRating(a.superstruc),
      substructure_condition: this.decodeRating(a.substructu),
      operating_rating_tons: a.operating_ || null,
      max_span_length_m: a.max_span_l || null,
      deck_width_m: a.deck_width || null,
      main_spans: a.main_unit_ || null,
      avg_daily_traffic: a.adt_029 || null,
      open_status: this.decodeOpenClose(a.open_close),
      lowest_sufficiency_rating: a.lowest_rat,
      scour_critical: this.decodeScour(a.scour_crit),
      last_inspection: a.date_of_in ? this.decodeInspectionDate(a.date_of_in) : null,
    };
  }

  private formatDetailedBridge(a: NbiBridgeAttributes): Record<string, unknown> {
    return {
      ...this.formatBridge(a),
      county_code: a.county_cod,
      place_code: a.place_code,
      inventory_rating_tons: a.inventory_ || null,
      approach_spans: a.appr_spans || null,
      deck_area_m2: a.deck_area || null,
      avg_daily_traffic_year: a.year_adt_0 || null,
      future_adt: a.future_adt || null,
      future_adt_year: a.year_of_fu || null,
      inspection_frequency_months: a.inspect_fr || null,
      bridge_improvement_cost: a.bridge_imp || null,
      roadway_improvement_cost: a.roadway_im || null,
      total_project_cost: a.total_imp_ || null,
      improvement_year: a.year_of_im || null,
      owner: a.owner_022,
      maintenance_responsibility: a.maintenanc,
      functional_class: a.functional,
      design_load: a.design_loa,
      deck_structure_type: a.deck_struc,
      surface_type: a.surface_ty,
      toll: a.toll_020 === '1' ? 'toll' : a.toll_020 === '2' ? 'toll-free' : 'other',
      temp_structure: a.temp_struc === 'T',
      federal_lands: a.fed_agency === 'Y',
      skew_angle_deg: a.degrees_sk || 0,
      posting_status: a.posting_ev,
      fracture_critical: a.fracture_0 === 'Y',
    };
  }

  private decodeCondition(code: string): string {
    const map: Record<string, string> = { G: 'Good', F: 'Fair', P: 'Poor', N: 'Not applicable' };
    return map[code?.trim()] ?? code?.trim() ?? 'Unknown';
  }

  private decodeRating(code: string): string {
    const map: Record<string, string> = {
      '9': 'Excellent',
      '8': 'Very Good',
      '7': 'Good',
      '6': 'Satisfactory',
      '5': 'Fair',
      '4': 'Poor',
      '3': 'Serious',
      '2': 'Critical',
      '1': 'Imminent failure',
      '0': 'Failed',
      N: 'Not applicable',
    };
    return map[code?.trim()] ?? code?.trim() ?? 'Unknown';
  }

  private decodeOpenClose(code: string): string {
    const map: Record<string, string> = {
      A: 'Open',
      P: 'Posted (load restricted)',
      K: 'Posted (combination restriction)',
      D: 'Closed for construction',
      E: 'Closed (other)',
      R: 'Posted (routine permit)',
      Z: 'Posted (weight/width)',
    };
    return map[code?.trim()] ?? code?.trim() ?? 'Unknown';
  }

  private decodeScour(code: string): string {
    const map: Record<string, string> = {
      '0': 'Low risk',
      '1': 'Screened',
      '2': 'Calculated',
      '3': 'Calculated (tidal)',
      '4': 'Countermeasures installed',
      '5': 'Countermeasures needed',
      '6': 'Countermeasures needed (tidal)',
      '7': 'Low risk (screened)',
      '8': 'Low risk (dry)',
      '9': 'Not over water',
      T: 'Tidal waterway',
      U: 'Unknown risk',
    };
    return map[code?.trim()] ?? code?.trim() ?? 'Unknown';
  }

  private decodeInspectionDate(code: string): string | null {
    // Format: MMYY or MMYYYY
    if (!code || code.trim().length < 3) return null;
    const s = code.trim();
    if (s.length === 3) {
      const mm = s.slice(0, 1).padStart(2, '0');
      const yy = s.slice(1);
      return `20${yy}-${mm}`;
    }
    if (s.length === 4) {
      const mm = s.slice(0, 2);
      const yy = s.slice(2);
      return `20${yy}-${mm}`;
    }
    return s;
  }
}
