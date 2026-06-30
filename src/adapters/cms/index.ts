import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  CmsQueryResponse,
  CmsHospital,
  CmsNursingHome,
  CmsHomeHealthAgency,
  CmsDialysisFacility,
} from './types';

/**
 * CMS Provider Data adapter (UC-561).
 *
 * Supported tools (read-only, POST datastore query):
 *   cms.hospital_search      → /datastore/query/xubh-q36u/0  (5 432 US hospitals)
 *   cms.nursing_home_search  → /datastore/query/4pq5-n9py/0  (14 695 nursing homes)
 *   cms.home_health_search   → /datastore/query/6jpm-sxkc/0  (12 392 home health agencies)
 *   cms.dialysis_search      → /datastore/query/23ew-n7w9/0  (7 557 dialysis facilities)
 *
 * Auth: None (US Government public domain — data.cms.gov).
 */
export class CmsAdapter extends BaseAdapter {
  private static readonly DATASET = {
    'cms.hospital_search': 'xubh-q36u',
    'cms.nursing_home_search': '4pq5-n9py',
    'cms.home_health_search': '6jpm-sxkc',
    'cms.dialysis_search': '23ew-n7w9',
  } as const;

  constructor() {
    super({
      provider: 'cms',
      baseUrl: 'https://data.cms.gov/provider-data/api/1/datastore/query',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const toolId = req.toolId as keyof typeof CmsAdapter.DATASET;
    const dataset = CmsAdapter.DATASET[toolId];

    if (!dataset) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Unsupported tool: ${req.toolId}`,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    const conditions: Array<{ property: string; value: string; operator: string }> = [];

    // Common filters
    if (params.state) {
      conditions.push({
        property: 'state',
        value: String(params.state).toUpperCase(),
        operator: '=',
      });
    }
    if (params.city) {
      conditions.push({ property: 'citytown', value: String(params.city), operator: 'LIKE' });
    }
    if (params.zip_code) {
      conditions.push({ property: 'zip_code', value: String(params.zip_code), operator: '=' });
    }

    // Tool-specific filters
    switch (req.toolId) {
      case 'cms.hospital_search': {
        if (params.name) {
          conditions.push({
            property: 'facility_name',
            value: `%${String(params.name)}%`,
            operator: 'LIKE',
          });
        }
        if (params.hospital_type) {
          conditions.push({
            property: 'hospital_type',
            value: String(params.hospital_type),
            operator: '=',
          });
        }
        if (params.min_rating) {
          conditions.push({
            property: 'hospital_overall_rating',
            value: String(params.min_rating),
            operator: '>=',
          });
        }
        break;
      }
      case 'cms.nursing_home_search': {
        if (params.name) {
          conditions.push({
            property: 'provider_name',
            value: `%${String(params.name)}%`,
            operator: 'LIKE',
          });
        }
        if (params.min_rating) {
          conditions.push({
            property: 'overall_rating',
            value: String(params.min_rating),
            operator: '>=',
          });
        }
        if (params.ownership_type) {
          conditions.push({
            property: 'ownership_type',
            value: String(params.ownership_type),
            operator: '=',
          });
        }
        break;
      }
      case 'cms.home_health_search': {
        if (params.name) {
          conditions.push({
            property: 'provider_name',
            value: `%${String(params.name)}%`,
            operator: 'LIKE',
          });
        }
        if (params.offers_nursing) {
          conditions.push({
            property: 'offers_nursing_care_services',
            value: 'Yes',
            operator: '=',
          });
        }
        break;
      }
      case 'cms.dialysis_search': {
        if (params.name) {
          conditions.push({
            property: 'facility_name',
            value: `%${String(params.name)}%`,
            operator: 'LIKE',
          });
        }
        if (params.nonprofit_only) {
          conditions.push({ property: 'profit_or_nonprofit', value: 'Non-profit', operator: '=' });
        }
        break;
      }
    }

    const limit = Math.min(Number(params.limit ?? 20), 100);
    const offset = Number(params.offset ?? 0);

    const body = JSON.stringify({ conditions, limit, offset, count: true });

    return {
      url: `${this.baseUrl}/${dataset}/0`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
      },
      body,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as CmsQueryResponse;
    const results = body.results ?? [];
    const total = body.count ?? 0;

    switch (req.toolId) {
      case 'cms.hospital_search': {
        return {
          total,
          count: results.length,
          hospitals: results.map((r) => {
            const h = r as unknown as CmsHospital;
            return {
              facility_id: h.facility_id,
              name: h.facility_name,
              address: h.address,
              city: h.citytown,
              state: h.state,
              zip_code: h.zip_code,
              county: h.countyparish,
              phone: h.telephone_number,
              hospital_type: h.hospital_type,
              ownership: h.hospital_ownership,
              emergency_services: h.emergency_services === 'Yes',
              overall_rating: h.hospital_overall_rating ? Number(h.hospital_overall_rating) : null,
            };
          }),
        };
      }

      case 'cms.nursing_home_search': {
        return {
          total,
          count: results.length,
          nursing_homes: results.map((r) => {
            const n = r as unknown as CmsNursingHome;
            return {
              ccn: n.cms_certification_number_ccn,
              name: n.provider_name,
              address: n.provider_address,
              city: n.citytown,
              state: n.state,
              zip_code: n.zip_code,
              phone: n.telephone_number,
              ownership_type: n.ownership_type,
              certified_beds: n.number_of_certified_beds
                ? Number(n.number_of_certified_beds)
                : null,
              overall_rating: n.overall_rating ? Number(n.overall_rating) : null,
              health_inspection_rating: n.health_inspection_rating
                ? Number(n.health_inspection_rating)
                : null,
              staffing_rating: n.staffing_rating ? Number(n.staffing_rating) : null,
              quality_measure_rating: n.quality_measure_rating
                ? Number(n.quality_measure_rating)
                : null,
            };
          }),
        };
      }

      case 'cms.home_health_search': {
        return {
          total,
          count: results.length,
          agencies: results.map((r) => {
            const a = r as unknown as CmsHomeHealthAgency;
            return {
              ccn: a.cms_certification_number_ccn,
              name: a.provider_name,
              address: a.address,
              city: a.citytown,
              state: a.state,
              zip_code: a.zip_code,
              phone: a.telephone_number,
              ownership: a.type_of_ownership,
              offers_nursing: a.offers_nursing_care_services === 'Yes',
              offers_pt: a.offers_physical_therapy_services === 'Yes',
              offers_ot: a.offers_occupational_therapy_services === 'Yes',
              quality_star_rating: a.quality_of_patient_care_star_rating
                ? Number(a.quality_of_patient_care_star_rating)
                : null,
            };
          }),
        };
      }

      case 'cms.dialysis_search': {
        return {
          total,
          count: results.length,
          facilities: results.map((r) => {
            const d = r as unknown as CmsDialysisFacility;
            return {
              ccn: d.cms_certification_number_ccn,
              name: d.facility_name,
              address: d.address_line_1,
              city: d.citytown,
              state: d.state,
              zip_code: d.zip_code,
              phone: d.telephone_number,
              profit_status: d.profit_or_nonprofit,
              chain_owned: d.chain_owned === 'Yes',
              five_star_rating: d.five_star || null,
            };
          }),
        };
      }

      default:
        return body;
    }
  }
}
