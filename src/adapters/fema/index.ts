import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FemaDisastersOutput,
  FemaFloodClaimsOutput,
  FemaAssistanceOutput,
  DisasterDeclaration,
  FloodClaim,
  HousingAssistance,
} from './types';

const FEMA_BASE = 'https://www.fema.gov/api/open/v2';

/**
 * OpenFEMA adapter (UC-334).
 *
 * US federal disaster declarations, flood insurance claims, housing assistance.
 * All disasters since 1953. OData v4 query syntax.
 *
 * Auth: None. US Gov open data, unlimited.
 */
export class FemaAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'fema', baseUrl: FEMA_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'fema.disasters': {
        const filters: string[] = [];
        if (params.state) filters.push(`state eq '${String(params.state).toUpperCase()}'`);
        if (params.incident_type) filters.push(`incidentType eq '${String(params.incident_type)}'`);
        if (params.year) filters.push(`fyDeclared eq ${Number(params.year)}`);

        const qp = new URLSearchParams();
        if (filters.length) qp.set('$filter', filters.join(' and '));
        qp.set('$top', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('$orderby', 'declarationDate desc');
        qp.set(
          '$select',
          'disasterNumber,declarationTitle,state,declarationType,incidentType,declarationDate,incidentBeginDate,incidentEndDate,designatedArea,ihProgramDeclared,iaProgramDeclared,paProgramDeclared,hmProgramDeclared',
        );

        return {
          url: `${FEMA_BASE}/DisasterDeclarationsSummaries?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'fema.flood_claims': {
        const filters: string[] = [];
        filters.push(`state eq '${String(params.state).toUpperCase()}'`);
        if (params.year) filters.push(`yearOfLoss eq ${Number(params.year)}`);

        const qp = new URLSearchParams();
        qp.set('$filter', filters.join(' and '));
        qp.set('$top', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('$orderby', 'yearOfLoss desc');
        qp.set(
          '$select',
          'state,countyCode,yearOfLoss,ratedFloodZone,amountPaidOnBuildingClaim,amountPaidOnContentsClaim,totalBuildingInsuranceCoverage,totalContentsInsuranceCoverage,causeOfDamage,occupancyType',
        );

        return {
          url: `${FEMA_BASE}/FimaNfipClaims?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'fema.assistance': {
        const filters: string[] = [];
        filters.push(`state eq '${String(params.state).toUpperCase()}'`);
        if (params.disaster_number)
          filters.push(`disasterNumber eq ${Number(params.disaster_number)}`);

        const qp = new URLSearchParams();
        qp.set('$filter', filters.join(' and '));
        qp.set('$top', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('$orderby', 'disasterNumber desc');

        return {
          url: `${FEMA_BASE}/HousingAssistanceOwners?${qp.toString()}`,
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

    switch (req.toolId) {
      case 'fema.disasters':
        return this.parseDisasters(body);
      case 'fema.flood_claims':
        return this.parseFloodClaims(body);
      case 'fema.assistance':
        return this.parseAssistance(body);
      default:
        return body;
    }
  }

  private parseDisasters(body: Record<string, unknown>): FemaDisastersOutput {
    const records = (body.DisasterDeclarationsSummaries ?? []) as Record<string, unknown>[];
    const meta = (body.metadata ?? {}) as Record<string, unknown>;

    return {
      total: Number(meta.count ?? records.length),
      results: records.map(
        (r): DisasterDeclaration => ({
          disaster_number: Number(r.disasterNumber ?? 0),
          title: String(r.declarationTitle ?? ''),
          state: String(r.state ?? ''),
          declaration_type: String(r.declarationType ?? ''),
          incident_type: String(r.incidentType ?? ''),
          declaration_date: String(r.declarationDate ?? '').slice(0, 10),
          incident_begin: String(r.incidentBeginDate ?? '').slice(0, 10),
          incident_end: String(r.incidentEndDate ?? '').slice(0, 10),
          designated_areas: String(r.designatedArea ?? ''),
          ih_program: Boolean(r.ihProgramDeclared),
          ia_program: Boolean(r.iaProgramDeclared),
          pa_program: Boolean(r.paProgramDeclared),
          hm_program: Boolean(r.hmProgramDeclared),
        }),
      ),
    };
  }

  private parseFloodClaims(body: Record<string, unknown>): FemaFloodClaimsOutput {
    const records = (body.FimaNfipClaims ?? []) as Record<string, unknown>[];
    const meta = (body.metadata ?? {}) as Record<string, unknown>;

    return {
      total: Number(meta.count ?? records.length),
      results: records.map(
        (r): FloodClaim => ({
          state: String(r.state ?? ''),
          county_code: String(r.countyCode ?? ''),
          year_of_loss: Number(r.yearOfLoss ?? 0),
          flood_zone: String(r.ratedFloodZone ?? ''),
          building_payment:
            r.amountPaidOnBuildingClaim != null ? Number(r.amountPaidOnBuildingClaim) : null,
          contents_payment:
            r.amountPaidOnContentsClaim != null ? Number(r.amountPaidOnContentsClaim) : null,
          building_coverage:
            r.totalBuildingInsuranceCoverage != null
              ? Number(r.totalBuildingInsuranceCoverage)
              : null,
          contents_coverage:
            r.totalContentsInsuranceCoverage != null
              ? Number(r.totalContentsInsuranceCoverage)
              : null,
          cause_of_damage: String(r.causeOfDamage ?? ''),
          occupancy_type: Number(r.occupancyType ?? 0),
        }),
      ),
    };
  }

  private parseAssistance(body: Record<string, unknown>): FemaAssistanceOutput {
    const records = (body.HousingAssistanceOwners ?? []) as Record<string, unknown>[];
    const meta = (body.metadata ?? {}) as Record<string, unknown>;

    return {
      total: Number(meta.count ?? records.length),
      results: records.map(
        (r): HousingAssistance => ({
          disaster_number: Number(r.disasterNumber ?? 0),
          state: String(r.state ?? ''),
          county: String(r.county ?? ''),
          city: String(r.city ?? ''),
          valid_registrations: Number(r.validRegistrations ?? 0),
          avg_damage: Number(r.averageFemaInspectedDamage ?? 0),
          total_inspected: Number(r.totalInspected ?? 0),
          total_damage: Number(r.totalDamage ?? 0),
          total_approved: Number(r.totalApprovedIhpAmount ?? 0),
        }),
      ),
    };
  }
}
