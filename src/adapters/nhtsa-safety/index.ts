import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  NhtsaRecallsResponse,
  NhtsaComplaintsResponse,
  NhtsaRatingsResponse,
  NhtsaInvestigationsResponse,
} from './types';

/**
 * NHTSA Safety API adapter (UC-219).
 *
 * Supported tools:
 *   safety.recalls        → GET /recalls/recallsByVehicle
 *   safety.complaints     → GET /complaints/complaintsByVehicle
 *   safety.ratings        → GET /SafetyRatings/modelyear/{y}/make/{m}/model/{mod}
 *   safety.investigations → GET /investigations
 *
 * Auth: None (US government open data, unlimited).
 * Distinct from vPIC VIN decoder (vpic.nhtsa.dot.gov).
 */
export class NhtsaSafetyAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'nhtsa-safety',
      baseUrl: 'https://api.nhtsa.gov',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'safety.recalls':
        return this.buildRecalls(params, headers);
      case 'safety.complaints':
        return this.buildComplaints(params, headers);
      case 'safety.ratings':
        return this.buildRatings(params, headers);
      case 'safety.investigations':
        return this.buildInvestigations(params, headers);
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
      case 'safety.recalls': {
        const data = body as unknown as NhtsaRecallsResponse;
        return {
          count: data.Count ?? 0,
          recalls: (data.results ?? []).map((r) => ({
            campaign_number: r.NHTSACampaignNumber,
            manufacturer: r.Manufacturer,
            summary: r.Summary,
            consequence: r.Consequence,
            remedy: r.Remedy,
            year: r.ModelYear,
            make: r.Make,
            model: r.Model,
            report_date: r.ReportReceivedDate,
            component: r.Component,
            units_affected: r.PotentialNumberOfUnitsAffected ?? null,
          })),
        };
      }
      case 'safety.complaints': {
        const data = body as unknown as NhtsaComplaintsResponse;
        return {
          count: data.count ?? 0,
          complaints: (data.results ?? []).slice(0, 50).map((c) => ({
            odi_number: c.odiNumber,
            manufacturer: c.manufacturer,
            crash: c.crash,
            fire: c.fire,
            injuries: c.numberOfInjuries,
            deaths: c.numberOfDeaths,
            incident_date: c.dateOfIncident,
            filed_date: c.dateComplaintFiled,
            components: c.components,
            summary: c.summary,
          })),
        };
      }
      case 'safety.ratings': {
        const data = body as unknown as NhtsaRatingsResponse;
        return {
          count: data.Count ?? 0,
          ratings: (data.Results ?? []).map((r) => ({
            vehicle_id: r.VehicleId,
            description: r.VehicleDescription,
            overall: r.OverallRating ?? null,
            front_crash: r.OverallFrontCrashRating ?? null,
            side_crash: r.OverallSideCrashRating ?? null,
            rollover: r.RolloverRating ?? null,
            complaints_count: r.ComplaintsCount ?? null,
            recalls_count: r.RecallsCount ?? null,
            investigations_count: r.InvestigationCount ?? null,
          })),
        };
      }
      case 'safety.investigations': {
        const data = body as unknown as NhtsaInvestigationsResponse;
        return {
          count: (data.results ?? []).length,
          investigations: (data.results ?? []).slice(0, 50).map((inv) => ({
            id: inv.id,
            number: inv.investigationNumber,
            type: inv.investigationType,
            description: inv.description,
            nhtsa_id: inv.nhtsaId,
            latest_activity: inv.latestActivityDate,
            year: inv.issueYear,
          })),
        };
      }
      default:
        return body;
    }
  }

  private buildRecalls(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.make) qs.set('make', String(params.make));
    if (params.model) qs.set('model', String(params.model));
    if (params.model_year) qs.set('modelYear', String(params.model_year));

    return {
      url: `${this.baseUrl}/recalls/recallsByVehicle?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildComplaints(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.make) qs.set('make', String(params.make));
    if (params.model) qs.set('model', String(params.model));
    if (params.model_year) qs.set('modelYear', String(params.model_year));

    return {
      url: `${this.baseUrl}/complaints/complaintsByVehicle?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildRatings(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const year = String(params.model_year ?? '');
    const make = String(params.make ?? '');
    const model = String(params.model ?? '');
    const vehicleId = params.vehicle_id;

    // If vehicle_id provided, get full ratings for that specific vehicle
    if (vehicleId) {
      return {
        url: `${this.baseUrl}/SafetyRatings/VehicleId/${vehicleId}`,
        method: 'GET',
        headers,
      };
    }

    return {
      url: `${this.baseUrl}/SafetyRatings/modelyear/${encodeURIComponent(year)}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`,
      method: 'GET',
      headers,
    };
  }

  private buildInvestigations(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.make) qs.set('make', String(params.make));
    if (params.model) qs.set('model', String(params.model));

    return {
      url: `${this.baseUrl}/investigations?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }
}
