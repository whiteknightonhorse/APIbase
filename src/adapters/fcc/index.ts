import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  FccBlockFindRaw,
  FccProceedingRaw,
  FccFilingRaw,
  FccProceedingsResponse,
  FccFilingsResponse,
} from './types';

const GEO_BASE = 'https://geo.fcc.gov';
const ECFS_BASE = 'https://publicapi.fcc.gov/ecfs';

/**
 * FCC Open Data adapter (UC-455).
 *
 * Provides US Census Block geolocation (no auth) and FCC ECFS regulatory
 * proceeding/filing data (via api.data.gov shared key, unlimited free).
 */
export class FccAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({ provider: 'fcc', baseUrl: ECFS_BASE });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'fcc.geo.block_fips': {
        const lat = encodeURIComponent(String(p.latitude));
        const lon = encodeURIComponent(String(p.longitude));
        const year = p.census_year
          ? `&censusYear=${encodeURIComponent(String(p.census_year))}`
          : '';
        return {
          url: `${GEO_BASE}/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json${year}`,
          method: 'GET',
          headers,
        };
      }

      case 'fcc.regulatory.proceedings': {
        const qs = new URLSearchParams();
        qs.set('api_key', this.apiKey);
        const limit = Math.max(1, Math.min(25, Number(p.limit ?? 10)));
        qs.set('limit', String(limit));
        if (p.q) qs.set('q', String(p.q));
        if (p.bureau) qs.set('bureau_code', String(p.bureau));
        if (p.sort) qs.set('sort', String(p.sort));
        else qs.set('sort', 'date_proceeding_created,DESC');
        return { url: `${ECFS_BASE}/proceedings?${qs.toString()}`, method: 'GET', headers };
      }

      case 'fcc.regulatory.filings': {
        const qs = new URLSearchParams();
        qs.set('api_key', this.apiKey);
        const limit = Math.max(1, Math.min(25, Number(p.limit ?? 10)));
        qs.set('limit', String(limit));
        if (p.docket) qs.set('proceedings.name', String(p.docket));
        if (p.sort) qs.set('sort', String(p.sort));
        else qs.set('sort', 'date_received,DESC');
        return { url: `${ECFS_BASE}/filings?${qs.toString()}`, method: 'GET', headers };
      }

      case 'fcc.regulatory.proceeding_detail': {
        const qs = new URLSearchParams();
        qs.set('api_key', this.apiKey);
        qs.set('name', String(p.docket));
        qs.set('limit', '1');
        return { url: `${ECFS_BASE}/proceedings?${qs.toString()}`, method: 'GET', headers };
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
      case 'fcc.geo.block_fips':
        return this.parseBlockFips(body as unknown as FccBlockFindRaw);
      case 'fcc.regulatory.proceedings':
        return this.parseProceedings(body as unknown as FccProceedingsResponse);
      case 'fcc.regulatory.filings':
        return this.parseFilings(body as unknown as FccFilingsResponse);
      case 'fcc.regulatory.proceeding_detail':
        return this.parseProceedingDetail(body as unknown as FccProceedingsResponse);
      default:
        return body;
    }
  }

  private parseBlockFips(body: FccBlockFindRaw): unknown {
    if (body.status !== 'OK') {
      return { status: body.status, message: body.statusMessage ?? 'Lookup failed' };
    }
    return {
      block_fips: body.Block?.FIPS ?? null,
      block_bbox: body.Block?.bbox ?? null,
      county_fips: body.County?.FIPS ?? null,
      county_name: body.County?.name ?? null,
      state_fips: body.State?.FIPS ?? null,
      state_code: body.State?.code ?? null,
      state_name: body.State?.name ?? null,
    };
  }

  private parseProceedings(body: FccProceedingsResponse): unknown {
    const list = body.proceeding ?? [];
    return {
      count: list.length,
      proceedings: list.map((p: FccProceedingRaw) => ({
        docket: p.name ?? null,
        description: (p.description_display ?? p.description ?? '').trim().slice(0, 300),
        bureau: p.bureau?.name ?? null,
        bureau_code: p.bureau?.code ?? null,
        type: p.flag_rulemaking_or_docket === 'R' ? 'Rulemaking' : 'Docket',
        status: p.flag_open_close === 'C' ? 'closed' : 'open',
        archived: p.flag_archived === 'Y',
        filing_count: p.total_filing_count ?? null,
        created: p.date_proceeding_created ?? null,
        closed: p.date_closed ?? null,
        nprm_date: p.date_nprm ?? null,
        applicant: (p.applicant_name ?? '').trim() || null,
      })),
    };
  }

  private parseFilings(body: FccFilingsResponse): unknown {
    const list = body.filing ?? [];
    return {
      count: list.length,
      filings: list.map((f: FccFilingRaw) => ({
        id: f.id_submission ?? null,
        date_received: f.date_received ?? null,
        submission_type: f.submissiontype?.description ?? null,
        filers: (f.filers ?? [])
          .map((fl) => fl.name)
          .filter(Boolean)
          .slice(0, 5),
        law_firms: (f.lawfirms ?? [])
          .map((lf) => lf.name)
          .filter(Boolean)
          .slice(0, 3),
        proceedings: (f.proceedings ?? []).map((pr) => pr.name).filter(Boolean),
        bureau:
          (f.bureaus ?? [])
            .map((b) => b.name)
            .filter(Boolean)
            .join(', ') || null,
        documents: (f.documents ?? []).slice(0, 5).map((d) => ({
          filename: d.filename,
          url: d.src,
          description: d.description || null,
        })),
        report_number: f.report_number || null,
        is_express_comment: f.express_comment === 1,
      })),
    };
  }

  private parseProceedingDetail(body: FccProceedingsResponse): unknown {
    const list = body.proceeding ?? [];
    if (!list.length) {
      return { found: false, docket: null };
    }
    const p = list[0];
    return {
      found: true,
      docket: p.name ?? null,
      description: (p.description_display ?? p.description ?? '').trim(),
      bureau: p.bureau?.name ?? null,
      bureau_code: p.bureau?.code ?? null,
      type: p.flag_rulemaking_or_docket === 'R' ? 'Rulemaking' : 'Docket',
      status: p.flag_open_close === 'C' ? 'closed' : 'open',
      archived: p.flag_archived === 'Y',
      filing_count: p.total_filing_count ?? null,
      created: p.date_proceeding_created ?? null,
      closed: p.date_closed ?? null,
      nprm_date: p.date_nprm ?? null,
      public_notice_date: p.date_public_notice ?? null,
      applicant: (p.applicant_name ?? '').trim() || null,
      file_number: p.file_number || null,
    };
  }
}
