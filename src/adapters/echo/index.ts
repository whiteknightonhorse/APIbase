import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  EchoFacility,
  EchoFacilitySearchOutput,
  EchoFacilityDetailOutput,
  EchoEnvInterest,
  EchoAirFacility,
  EchoAirFacilitiesOutput,
  EchoEnforcementAction,
  EchoViolationsOutput,
} from './types';
import { stripHtml } from '../../utils/strip-html';

const ECHO_BASE = 'https://echodata.epa.gov/echo';

/**
 * EPA ECHO adapter (UC-577).
 *
 * Enforcement and Compliance History Online — regulated facility search,
 * facility detail, Clean Air Act facilities, and enforcement/violation history.
 *
 * Auth: None. US Gov open data, public domain (17 USC §105).
 * Rate limit: 300 req/hour, 1500/day per IP (mitigated by caching).
 */
export class EchoAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'echo', baseUrl: ECHO_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/1.0 (https://apibase.pro; compliance@apibase.pro)',
    };

    switch (req.toolId) {
      case 'echo.facility_search': {
        const qp = new URLSearchParams({ output: 'JSON' });

        const zipCode = params.zip_code ? String(params.zip_code).trim() : null;
        const facilityName = params.facility_name ? String(params.facility_name).trim() : null;
        const state = params.state ? String(params.state).toUpperCase().trim() : null;

        if (zipCode) {
          qp.set('p_zip', zipCode);
        } else if (facilityName) {
          qp.set('p_name', encodeURIComponent(facilityName));
          if (state) qp.set('p_st', state);
        }
        if (state && !facilityName) qp.set('p_st', state);

        const activeOnly = params.active_only !== false;
        if (activeOnly) qp.set('p_act', 'Y');

        qp.set('rows', String(Math.min(Number(params.limit) || 10, 50)));

        return {
          url: `${ECHO_BASE}/echo_rest_services.get_facilities?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'echo.facility_detail': {
        const registryId = encodeURIComponent(String(params.registry_id).trim());
        return {
          url: `${ECHO_BASE}/echo_rest_services.get_facility_info?output=JSON&p_id=${registryId}`,
          method: 'GET',
          headers,
        };
      }

      case 'echo.air_facilities': {
        const qp = new URLSearchParams({ output: 'JSON' });

        const zipCode = params.zip_code ? String(params.zip_code).trim() : null;
        const facilityName = params.facility_name ? String(params.facility_name).trim() : null;
        const state = params.state ? String(params.state).toUpperCase().trim() : null;

        if (zipCode) {
          qp.set('p_zip', zipCode);
        } else if (facilityName) {
          qp.set('p_name', encodeURIComponent(facilityName));
          if (state) qp.set('p_st', state);
        }
        if (state && !facilityName) qp.set('p_st', state);

        qp.set('rows', String(Math.min(Number(params.limit) || 10, 50)));

        return {
          url: `${ECHO_BASE}/air_rest_services.get_facilities?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'echo.violations': {
        const registryId = encodeURIComponent(String(params.registry_id).trim());
        return {
          url: `${ECHO_BASE}/echo_rest_services.get_enforcement_actions?output=JSON&p_id=${registryId}`,
          method: 'GET',
          headers,
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
    const body = raw.body as Record<string, unknown>;
    const results = (body.Results ?? {}) as Record<string, unknown>;

    if (results.Error) {
      const errMsg = ((results.Error as Record<string, unknown>).ErrorMessage ?? '') as string;
      if (errMsg.includes('exceed')) {
        throw {
          code: ProviderErrorCode.RATE_LIMIT,
          httpStatus: 429,
          message: `EPA ECHO rate limit: ${errMsg}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
      }
      if (errMsg.includes('Queryset Limit')) {
        throw {
          code: ProviderErrorCode.INPUT_REJECTED,
          httpStatus: 422,
          message: `Search too broad — add zip_code or more specific parameters. ${errMsg}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
      }
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `EPA ECHO error: ${errMsg}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    switch (req.toolId) {
      case 'echo.facility_search':
        return this.parseFacilitySearch(results);
      case 'echo.facility_detail':
        return this.parseFacilityDetail(results);
      case 'echo.air_facilities':
        return this.parseAirFacilities(results);
      case 'echo.violations':
        return this.parseViolations(results, req.params as Record<string, unknown>);
      default:
        return results;
    }
  }

  private parseFacilitySearch(results: Record<string, unknown>): EchoFacilitySearchOutput {
    const facilities = (results.Facilities ?? []) as Record<string, unknown>[];
    const queryRows = Number(results.QueryRows ?? facilities.length);

    return {
      total: queryRows,
      results: facilities.map(
        (f): EchoFacility => ({
          registry_id: String(f.RegistryID ?? ''),
          facility_name: stripHtml(String(f.FacilityName ?? '')),
          address: String(f.LocationAddress ?? ''),
          city: String(f.CityName ?? ''),
          state: String(f.StateCode ?? ''),
          zip_code: String(f.ZipCode ?? ''),
          latitude: f.Latitude83 != null && f.Latitude83 !== '' ? Number(f.Latitude83) : null,
          longitude: f.Longitude83 != null && f.Longitude83 !== '' ? Number(f.Longitude83) : null,
          status: String(f.FacilityStatus ?? ''),
          sic_code: String(f.PrimeSICCode ?? ''),
          sic_desc: String(f.PrimeSICDesc ?? ''),
          naics_code: String(f.PrimNAICSCode ?? ''),
          programs: {
            caa: String(f.CAAFlag ?? '') === 'Y',
            cwa: String(f.CWAFlag ?? '') === 'Y',
            rcra: String(f.RCRAFlag ?? '') === 'Y',
            sdwa: String(f.SDWAFlag ?? '') === 'Y',
            tri: String(f.TRIFlag ?? '') === 'Y',
            ghg: String(f.GHGFlag ?? '') === 'Y',
          },
          penalties_total: String(f.TotalPenalty ?? '0'),
          inspections_count: Number(f.InspectCount ?? 0),
          date_last_inspection: String(f.DateLastInspection ?? ''),
          formal_actions: Number(f.FormalCount ?? 0),
          informal_actions: Number(f.InformalCount ?? 0),
        }),
      ),
    };
  }

  private parseFacilityDetail(results: Record<string, unknown>): EchoFacilityDetailOutput {
    const fac = (results.FRSFacility ?? {}) as Record<string, unknown>;
    const interests = (results.EnvInterest ?? []) as Record<string, unknown>[];

    return {
      registry_id: String(fac.RegistryID ?? ''),
      facility_name: stripHtml(String(fac.PrimFacilName ?? '')),
      address: String(fac.LocationAddress ?? ''),
      city: String(fac.CityName ?? ''),
      state: String(fac.StateCode ?? ''),
      zip_code: String(fac.ZipCode ?? ''),
      county: String(fac.CountyName ?? ''),
      latitude: fac.Latitude83 != null && fac.Latitude83 !== '' ? Number(fac.Latitude83) : null,
      longitude: fac.Longitude83 != null && fac.Longitude83 !== '' ? Number(fac.Longitude83) : null,
      sic_code: String(fac.SICCode ?? ''),
      naics_code: String(fac.NAICSCode ?? ''),
      huc_code: String(fac.HUCCode ?? ''),
      federal_facility: String(fac.FedFacilCode ?? '') === 'YES',
      created_date: String(fac.FacilCreatedDate ?? '').slice(0, 10),
      terminated_date: String(fac.FacilTerminatedDate ?? '').slice(0, 10),
      env_interests: interests.map(
        (i): EchoEnvInterest => ({
          interest_type: String(i.InterestType ?? ''),
          system: String(i.SystemAcronym ?? ''),
          alt_id: String(i.AltID ?? ''),
          active_status: String(i.ActiveStatus ?? ''),
          federal_ind: String(i.FedInd ?? ''),
        }),
      ),
    };
  }

  private parseAirFacilities(results: Record<string, unknown>): EchoAirFacilitiesOutput {
    const facilities = (results.Facilities ?? []) as Record<string, unknown>[];
    const queryRows = Number(results.QueryRows ?? facilities.length);

    return {
      total: queryRows,
      results: facilities.map(
        (f): EchoAirFacility => ({
          registry_id: String(f.RegistryID ?? ''),
          facility_name: stripHtml(String(f.FacilityName ?? '')),
          address: String(f.LocationAddress ?? ''),
          city: String(f.CityName ?? ''),
          state: String(f.StateCode ?? ''),
          zip_code: String(f.ZipCode ?? ''),
          latitude: f.Latitude83 != null && f.Latitude83 !== '' ? Number(f.Latitude83) : null,
          longitude: f.Longitude83 != null && f.Longitude83 !== '' ? Number(f.Longitude83) : null,
          permit_types: String(f.CAAPermitTypes ?? ''),
          permit_status: String(f.CAAPermiStatus ?? ''),
          quarters_noncompliance: String(f.AIRQtrsWithNC ?? '0'),
          inspections: String(f.AIRInspections ?? '0'),
          high_priority_violations: String(f.AIRHPV ?? ''),
        }),
      ),
    };
  }

  private parseViolations(
    results: Record<string, unknown>,
    params: Record<string, unknown>,
  ): EchoViolationsOutput {
    const actions = (results.EnforcementActions ?? []) as Record<string, unknown>[];

    return {
      registry_id: String(params.registry_id ?? ''),
      total_actions: actions.length,
      results: actions.map(
        (a): EchoEnforcementAction => ({
          activity_id: String(a.ActivityID ?? ''),
          activity_type: String(a.ActivityType ?? ''),
          action_type: String(a.EnfActionType ?? ''),
          action_subtype: String(a.ActionSubType ?? ''),
          settlement_date: String(a.SettlementDate ?? '').slice(0, 10),
          federal_penalty: String(a.FederalPenalty ?? '0'),
          state_penalty: String(a.StatePenalty ?? '0'),
          sep_amount: String(a.SEPAmount ?? '0'),
          program_codes: String(a.ProgramCodes ?? ''),
          compliance_schedule_required: String(a.ComplianceScheduleReqd ?? '') === 'Y',
        }),
      ),
    };
  }
}
