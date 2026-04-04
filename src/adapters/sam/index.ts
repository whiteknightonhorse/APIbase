import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { SamEntityResult, SamEntitySearchOutput, SamEntityDetailOutput } from './types';

const SAM_BASE = 'https://api.sam.gov/entity-information/v3';

/**
 * SAM.gov adapter (UC-338).
 *
 * US federal contractor/grantee registry — 700K+ entities.
 * UEI, CAGE codes, NAICS, business types, certifications.
 *
 * Auth: API key as query param `api_key=`. 10K req/day.
 * Key expires every 90 days — renew at sam.gov/profile/details.
 */
export class SamAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'sam', baseUrl: SAM_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const qp = new URLSearchParams();
    qp.set('api_key', this.apiKey);
    qp.set('registrationStatus', 'A');
    qp.set('samRegistered', 'Yes');

    switch (req.toolId) {
      case 'sam.entity_search': {
        qp.set('legalBusinessName', encodeURIComponent(String(params.name)));
        if (params.state) qp.set('physicalAddressProvinceOrStateCode', String(params.state));
        if (params.naics_code) qp.set('naicsCode', String(params.naics_code));
        qp.set('size', String(Math.min(Number(params.limit) || 10, 25)));
        qp.set('page', '0');
        return {
          url: `${SAM_BASE}/entities?${qp.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'sam.entity_detail': {
        qp.set('ueiSAM', encodeURIComponent(String(params.uei)));
        return {
          url: `${SAM_BASE}/entities?${qp.toString()}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
    const entities = (body.entityData ?? []) as Record<string, unknown>[];
    const total = Number(body.totalRecords ?? entities.length);

    switch (req.toolId) {
      case 'sam.entity_search':
        return this.parseSearch(entities, total);
      case 'sam.entity_detail':
        return this.parseDetail(entities);
      default:
        return body;
    }
  }

  private parseSearch(entities: Record<string, unknown>[], total: number): SamEntitySearchOutput {
    return {
      total,
      results: entities.map((e) => this.toEntityResult(e)),
    };
  }

  private parseDetail(
    entities: Record<string, unknown>[],
  ): SamEntityDetailOutput | SamEntitySearchOutput {
    if (entities.length === 0) {
      return { total: 0, results: [] };
    }

    const e = entities[0];
    const reg = (e.entityRegistration ?? {}) as Record<string, unknown>;
    const core = (e.coreData ?? {}) as Record<string, unknown>;
    const phys = (core.physicalAddress ?? {}) as Record<string, unknown>;
    const mail = (core.mailingAddress ?? {}) as Record<string, unknown>;
    const assertions = (e.assertions ?? {}) as Record<string, unknown>;
    const naicsArr = (core.naics ?? []) as Record<string, unknown>[];
    const pscArr = (core.psc ?? []) as Record<string, unknown>[];

    return {
      uei: String(reg.ueiSAM ?? ''),
      cage_code: String(reg.cageCode ?? ''),
      legal_name: String(reg.legalBusinessName ?? ''),
      dba_name: String(reg.dbaName ?? ''),
      registration_status: String(reg.registrationStatus ?? ''),
      activation_date: String(reg.activationDate ?? ''),
      expiration_date: String(reg.registrationExpirationDate ?? ''),
      physical_address: this.formatAddress(phys),
      mailing_address: this.formatAddress(mail),
      state: String(phys.stateOrProvinceCode ?? ''),
      country: String(phys.countryCode ?? ''),
      congressional_district: String(core.congressionalDistrict ?? ''),
      naics_codes: naicsArr.map((n) => ({
        code: String(n.naicsCode ?? ''),
        primary: Boolean(n.primaryNaics),
      })),
      psc_codes: pscArr.map((p) => String(p.pscCode ?? '')),
      business_types: this.extractBusinessTypes(assertions),
      entity_structure: String(core.entityStructureDesc ?? ''),
      organization_structure: String(core.organizationStructureDesc ?? ''),
      entity_url: String(core.entityUrl ?? ''),
    };
  }

  private toEntityResult(e: Record<string, unknown>): SamEntityResult {
    const reg = (e.entityRegistration ?? {}) as Record<string, unknown>;
    const core = (e.coreData ?? {}) as Record<string, unknown>;
    const phys = (core.physicalAddress ?? {}) as Record<string, unknown>;
    const assertions = (e.assertions ?? {}) as Record<string, unknown>;
    const naicsArr = (core.naics ?? []) as Record<string, unknown>[];

    return {
      uei: String(reg.ueiSAM ?? ''),
      cage_code: String(reg.cageCode ?? ''),
      legal_name: String(reg.legalBusinessName ?? ''),
      dba_name: String(reg.dbaName ?? ''),
      registration_status: String(reg.registrationStatus ?? ''),
      expiration_date: String(reg.registrationExpirationDate ?? ''),
      physical_address: this.formatAddress(phys),
      state: String(phys.stateOrProvinceCode ?? ''),
      country: String(phys.countryCode ?? ''),
      naics_codes: naicsArr.map((n) => String(n.naicsCode ?? '')),
      business_types: this.extractBusinessTypes(assertions),
      entity_structure: String(core.entityStructureDesc ?? ''),
      sam_registered: reg.registrationStatus === 'A',
    };
  }

  private formatAddress(addr: Record<string, unknown>): string {
    const parts = [
      addr.addressLine1,
      addr.city,
      addr.stateOrProvinceCode,
      addr.zipCode,
      addr.countryCode,
    ].filter(Boolean);
    return parts.join(', ');
  }

  private extractBusinessTypes(assertions: Record<string, unknown>): string[] {
    const types: string[] = [];
    if (assertions.isSmallBusiness) types.push('Small Business');
    if (assertions.isWomanOwnedBusiness) types.push('Woman-Owned');
    if (assertions.isVeteranOwnedBusiness) types.push('Veteran-Owned');
    if (assertions.isServiceDisabledVeteranOwnedBusiness)
      types.push('Service-Disabled Veteran-Owned');
    if (assertions.isHUBZoneCertified) types.push('HUBZone');
    if (assertions.is8ACertified) types.push('8(a)');
    if (assertions.isMinorityOwned) types.push('Minority-Owned');
    return types;
  }
}
