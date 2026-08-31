import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  HdxHapiOperationalPresenceResponse,
  HdxHapiHumanitarianNeedsResponse,
  HdxHapiBaselinePopulationResponse,
  HdxHapiFoodSecurityResponse,
} from './types';

const HAPI_BASE = 'https://hapi.humdata.org/api/v2';
/**
 * Self-declared, non-secret app identification string required by every HAPI request
 * (base64("APIbase:contact@apibase.pro"), generated via the public
 * /api/v2/encode_app_identifier helper). Not a credential — HAPI has no signup/API keys.
 */
const APP_IDENTIFIER = 'QVBJYmFzZTpjb250YWN0QGFwaWJhc2UucHJv';

const ISO3_RE = /^[A-Za-z]{3}$/;
const ADMIN_LEVELS = new Set(['0', '1', '2']);
const GENDERS = new Set(['f', 'm', 'x', 'u', 'o', 'all']);
const IPC_PHASES = new Set(['1', '2', '3', '4', '5', '3+', 'all']);
const POPULATION_STATUSES = new Set(['AFF', 'INN', 'TGT', 'REA', 'all']);

/**
 * HDX Humanitarian API (HAPI) v2 adapter (UC-648).
 *
 * Supported tools:
 *   hdx-hapi.operational_presence  -> coordination-context/operational-presence  3W: who's doing
 *                                     what, where (org + sector by admin area)
 *   hdx-hapi.humanitarian_needs    -> affected-people/humanitarian-needs         People-in-Need
 *                                     figures by sector/category/population-status
 *   hdx-hapi.baseline_population   -> geography-infrastructure/baseline-population  Demographic
 *                                     breakdown by gender/age-range/admin area
 *   hdx-hapi.food_security         -> food-security-nutrition-poverty/food-security  IPC phase
 *                                     classification (current + projections)
 *
 * Auth: None — HAPI has no signup/API keys, only a self-declared `app_identifier` (base64
 * app_name:email, not a secret) required on every request per the HAPI Terms of Service. Run by
 * UN OCHA Centre for Humanitarian Data, CC BY 4.0 (data.humdata.org site licence). Terms cap
 * every response at 10,000 rows server-side and ask callers to self-throttle to ~1 req/sec; `limit`
 * is additionally capped at 1000 client-side here (largest observed row ~500 bytes -> well under
 * the 1MB PROVIDER_MAX_RESPONSE_BYTES default even with zero filters applied).
 */
export class HdxHapiAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'hdx-hapi', baseUrl: HAPI_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const qs = new URLSearchParams();
    qs.set('app_identifier', APP_IDENTIFIER);
    qs.set('output_format', 'json');
    qs.set('offset', String(this.clamp(params.offset, 0, 0, 100_000)));
    qs.set('limit', String(this.clamp(params.limit, 100, 1, 1000)));
    this.applyCommonFilters(qs, params, req.toolId);

    let path: string;
    switch (req.toolId) {
      case 'hdx-hapi.operational_presence': {
        path = 'coordination-context/operational-presence';
        const sectorName = this.trimmed(params.sector_name);
        if (sectorName) qs.set('sector_name', sectorName);
        const orgName = this.trimmed(params.org_name);
        if (orgName) qs.set('org_name', orgName);
        break;
      }

      case 'hdx-hapi.humanitarian_needs': {
        path = 'affected-people/humanitarian-needs';
        const sectorName = this.trimmed(params.sector_name);
        if (sectorName) qs.set('sector_name', sectorName);
        const populationStatus = this.trimmed(params.population_status);
        if (populationStatus) {
          if (!POPULATION_STATUSES.has(populationStatus)) {
            throw this.invalidInput(
              req.toolId,
              `population_status must be one of: ${[...POPULATION_STATUSES].join(', ')}`,
            );
          }
          qs.set('population_status', populationStatus);
        }
        break;
      }

      case 'hdx-hapi.baseline_population': {
        path = 'geography-infrastructure/baseline-population';
        const gender = this.trimmed(params.gender);
        if (gender) {
          if (!GENDERS.has(gender)) {
            throw this.invalidInput(
              req.toolId,
              `gender must be one of: ${[...GENDERS].join(', ')}`,
            );
          }
          qs.set('gender', gender);
        }
        const ageRange = this.trimmed(params.age_range);
        if (ageRange) qs.set('age_range', ageRange);
        break;
      }

      case 'hdx-hapi.food_security': {
        path = 'food-security-nutrition-poverty/food-security';
        const ipcPhase = this.trimmed(params.ipc_phase);
        if (ipcPhase) {
          if (!IPC_PHASES.has(ipcPhase)) {
            throw this.invalidInput(
              req.toolId,
              `ipc_phase must be one of: ${[...IPC_PHASES].join(', ')}`,
            );
          }
          qs.set('ipc_phase', ipcPhase);
        }
        break;
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

    return { url: `${HAPI_BASE}/${path}?${qs.toString()}`, method: 'GET', headers };
  }

  private applyCommonFilters(
    qs: URLSearchParams,
    params: Record<string, unknown>,
    toolId: string,
  ): void {
    const locationCode = this.trimmed(params.location_code);
    if (locationCode) {
      if (!ISO3_RE.test(locationCode)) {
        throw this.invalidInput(toolId, 'location_code must be a 3-letter ISO3 country code');
      }
      qs.set('location_code', locationCode.toUpperCase());
    }
    const locationName = this.trimmed(params.location_name);
    if (locationName) qs.set('location_name', locationName);
    const admin1Name = this.trimmed(params.admin1_name);
    if (admin1Name) qs.set('admin1_name', admin1Name);
    const adminLevel = this.trimmed(params.admin_level);
    if (adminLevel) {
      if (!ADMIN_LEVELS.has(adminLevel)) {
        throw this.invalidInput(toolId, 'admin_level must be one of: 0, 1, 2');
      }
      qs.set('admin_level', adminLevel);
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'hdx-hapi.operational_presence': {
        const env = raw.body as HdxHapiOperationalPresenceResponse;
        return {
          returned: env.data.length,
          activities: env.data.map((r) => ({
            location_code: r.location_code,
            location_name: r.location_name,
            admin1_name: r.admin1_name,
            admin2_name: r.admin2_name,
            admin_level: r.admin_level,
            org_acronym: r.org_acronym,
            org_name: r.org_name,
            org_type: r.org_type_description,
            sector_code: r.sector_code,
            sector_name: r.sector_name,
            reference_period_start: r.reference_period_start,
            reference_period_end: r.reference_period_end,
          })),
        };
      }

      case 'hdx-hapi.humanitarian_needs': {
        const env = raw.body as HdxHapiHumanitarianNeedsResponse;
        return {
          returned: env.data.length,
          records: env.data.map((r) => ({
            location_code: r.location_code,
            location_name: r.location_name,
            admin1_name: r.admin1_name,
            admin2_name: r.admin2_name,
            admin_level: r.admin_level,
            sector_code: r.sector_code,
            sector_name: r.sector_name,
            category: r.category,
            population_status: r.population_status,
            population: r.population,
            reference_period_start: r.reference_period_start,
            reference_period_end: r.reference_period_end,
          })),
        };
      }

      case 'hdx-hapi.baseline_population': {
        const env = raw.body as HdxHapiBaselinePopulationResponse;
        return {
          returned: env.data.length,
          records: env.data.map((r) => ({
            location_code: r.location_code,
            location_name: r.location_name,
            admin1_name: r.admin1_name,
            admin2_name: r.admin2_name,
            admin_level: r.admin_level,
            gender: r.gender,
            age_range: r.age_range,
            min_age: r.min_age,
            max_age: r.max_age,
            population: r.population,
            reference_period_start: r.reference_period_start,
            reference_period_end: r.reference_period_end,
          })),
        };
      }

      case 'hdx-hapi.food_security': {
        const env = raw.body as HdxHapiFoodSecurityResponse;
        return {
          returned: env.data.length,
          records: env.data.map((r) => ({
            location_code: r.location_code,
            location_name: r.location_name,
            admin1_name: r.admin1_name,
            admin2_name: r.admin2_name,
            admin_level: r.admin_level,
            ipc_phase: r.ipc_phase,
            ipc_type: r.ipc_type,
            population_in_phase: r.population_in_phase,
            population_fraction_in_phase: r.population_fraction_in_phase,
            reference_period_start: r.reference_period_start,
            reference_period_end: r.reference_period_end,
          })),
        };
      }

      default:
        return raw.body;
    }
  }

  private trimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(Math.trunc(n), min), max);
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
