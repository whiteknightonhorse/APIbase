import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  WaterSystem,
  WaterSystemsOutput,
  DrinkingWaterViolation,
  ViolationsOutput,
  EnforcementAction,
  EnforcementOutput,
  ServiceArea,
  ServiceAreasOutput,
} from './types';

const SDWIS_BASE = 'https://data.epa.gov/efservice';

/**
 * EPA SDWIS (Safe Drinking Water Information System) adapter (UC-508).
 *
 * Public drinking water systems, violations, enforcement actions, and service areas
 * under the Safe Drinking Water Act. US Gov public domain, no auth required.
 *
 * API pattern: /TABLE/COLUMN/=/VALUE/rows/START:END/JSON
 */
export class SdwisAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'sdwis', baseUrl: SDWIS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (apibase.pro; contact@apibase.pro)',
    };
    const limit = Math.min(Number(p.limit) || 20, 100);

    switch (req.toolId) {
      case 'sdwis.water_systems': {
        const segments: string[] = ['/WATER_SYSTEM'];
        const state = p.state ? String(p.state).toUpperCase() : null;
        const type = p.type ? String(p.type).toUpperCase() : null;
        const activity = p.activity ? String(p.activity).toUpperCase() : null;

        if (state) segments.push(`/STATE_CODE/=/${encodeURIComponent(state)}`);
        if (type) segments.push(`/PWS_TYPE_CODE/=/${encodeURIComponent(type)}`);
        if (activity) segments.push(`/PWS_ACTIVITY_CODE/=/${encodeURIComponent(activity)}`);

        segments.push(`/rows/0:${limit}/JSON`);
        return { url: `${SDWIS_BASE}${segments.join('')}`, method: 'GET', headers };
      }

      case 'sdwis.violations': {
        const segments: string[] = ['/VIOLATION'];
        const state = p.state ? String(p.state).toUpperCase() : null;
        const healthBased = p.health_based;
        const category = p.category ? String(p.category).toUpperCase() : null;

        if (state) segments.push(`/PRIMACY_AGENCY_CODE/=/${encodeURIComponent(state)}`);
        if (healthBased === true) segments.push('/IS_HEALTH_BASED_IND/=/Y');
        if (category) segments.push(`/VIOLATION_CATEGORY_CODE/=/${encodeURIComponent(category)}`);

        segments.push(`/rows/0:${limit}/JSON`);
        return { url: `${SDWIS_BASE}${segments.join('')}`, method: 'GET', headers };
      }

      case 'sdwis.enforcement': {
        const segments: string[] = ['/ENFORCEMENT_ACTION'];
        const pwsid = p.pwsid ? String(p.pwsid).toUpperCase() : null;
        const actionType = p.action_type ? String(p.action_type).toUpperCase() : null;

        if (pwsid) segments.push(`/PWSID/=/${encodeURIComponent(pwsid)}`);
        if (actionType)
          segments.push(`/ENFORCEMENT_ACTION_TYPE_CODE/=/${encodeURIComponent(actionType)}`);

        segments.push(`/rows/0:${limit}/JSON`);
        return { url: `${SDWIS_BASE}${segments.join('')}`, method: 'GET', headers };
      }

      case 'sdwis.service_areas': {
        const segments: string[] = ['/GEOGRAPHIC_AREA'];
        const state = p.state ? String(p.state).toUpperCase() : null;
        const county = p.county ? String(p.county) : null;
        const pwsid = p.pwsid ? String(p.pwsid).toUpperCase() : null;

        if (pwsid) segments.push(`/PWSID/=/${encodeURIComponent(pwsid)}`);
        else if (state) segments.push(`/PRIMACY_AGENCY_CODE/=/${encodeURIComponent(state)}`);

        if (county) segments.push(`/COUNTY_SERVED/=/${encodeURIComponent(county)}`);

        segments.push(`/rows/0:${limit}/JSON`);
        return { url: `${SDWIS_BASE}${segments.join('')}`, method: 'GET', headers };
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
    // EFSERVICE returns a top-level JSON array directly
    const rows = Array.isArray(raw.body) ? (raw.body as Record<string, unknown>[]) : [];

    switch (req.toolId) {
      case 'sdwis.water_systems':
        return this.parseWaterSystems(rows);
      case 'sdwis.violations':
        return this.parseViolations(rows);
      case 'sdwis.enforcement':
        return this.parseEnforcement(rows);
      case 'sdwis.service_areas':
        return this.parseServiceAreas(rows);
      default:
        return raw.body;
    }
  }

  private parseWaterSystems(rows: Record<string, unknown>[]): WaterSystemsOutput {
    return {
      total: rows.length,
      results: rows.map(
        (r): WaterSystem => ({
          pwsid: String(r.pwsid ?? ''),
          name: String(r.pws_name ?? ''),
          state: String(r.state_code ?? ''),
          type: String(r.pws_type_code ?? ''),
          activity: String(r.pws_activity_code ?? ''),
          population_served:
            r.population_served_count != null ? Number(r.population_served_count) : null,
          service_connections:
            r.service_connections_count != null ? Number(r.service_connections_count) : null,
          source: String(r.primary_source_code ?? ''),
          owner_type: String(r.owner_type_code ?? ''),
          org_name: r.org_name != null ? String(r.org_name) : null,
          city: r.city_name != null ? String(r.city_name) : null,
          zip: r.zip_code != null ? String(r.zip_code) : null,
          epa_region: String(r.epa_region ?? ''),
        }),
      ),
    };
  }

  private parseViolations(rows: Record<string, unknown>[]): ViolationsOutput {
    return {
      total: rows.length,
      results: rows.map(
        (r): DrinkingWaterViolation => ({
          pwsid: String(r.pwsid ?? ''),
          violation_id: String(r.violation_id ?? ''),
          state: String(r.primacy_agency_code ?? ''),
          population_served:
            r.population_served_count != null ? Number(r.population_served_count) : null,
          violation_code: String(r.violation_code ?? ''),
          category: String(r.violation_category_code ?? ''),
          health_based: String(r.is_health_based_ind ?? 'N') === 'Y',
          contaminant_code: String(r.contaminant_code ?? ''),
          compliance_status: String(r.compliance_status_code ?? ''),
          measure: r.viol_measure != null ? Number(r.viol_measure) : null,
          unit: r.unit_of_measure != null ? String(r.unit_of_measure) : null,
          major: r.is_major_viol_ind != null ? String(r.is_major_viol_ind) === 'Y' : null,
          period_begin:
            r.compl_per_begin_date != null ? String(r.compl_per_begin_date).slice(0, 10) : null,
          period_end:
            r.compl_per_end_date != null ? String(r.compl_per_end_date).slice(0, 10) : null,
          rtc_date: r.rtc_date != null ? String(r.rtc_date).slice(0, 10) : null,
          notification_tier:
            r.public_notification_tier != null ? Number(r.public_notification_tier) : null,
          rule_code: String(r.rule_code ?? ''),
          rule_family: String(r.rule_family_code ?? ''),
        }),
      ),
    };
  }

  private parseEnforcement(rows: Record<string, unknown>[]): EnforcementOutput {
    return {
      total: rows.length,
      results: rows.map(
        (r): EnforcementAction => ({
          pwsid: String(r.pwsid ?? ''),
          enforcement_id: String(r.enforcement_id ?? ''),
          enforcement_date:
            r.enforcement_date != null ? String(r.enforcement_date).slice(0, 10) : null,
          action_type: String(r.enforcement_action_type_code ?? ''),
          originator: String(r.originator_code ?? ''),
          comment: r.enforcement_comment_text != null ? String(r.enforcement_comment_text) : null,
        }),
      ),
    };
  }

  private parseServiceAreas(rows: Record<string, unknown>[]): ServiceAreasOutput {
    return {
      total: rows.length,
      results: rows.map(
        (r): ServiceArea => ({
          pwsid: String(r.pwsid ?? ''),
          state: String(r.primacy_agency_code ?? ''),
          epa_region: String(r.epa_region ?? ''),
          state_served: r.state_served != null ? String(r.state_served) : null,
          county_served: r.county_served != null ? String(r.county_served) : null,
          city_served: r.city_served != null ? String(r.city_served) : null,
          zip_served: r.zip_code_served != null ? String(r.zip_code_served) : null,
          area_type: r.area_type_code != null ? String(r.area_type_code) : null,
          tribal_code: r.tribal_code != null ? String(r.tribal_code) : null,
        }),
      ),
    };
  }
}
