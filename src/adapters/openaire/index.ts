import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  OpenaireSearchResponse,
  OpenaireResearchProduct,
  OpenaireProject,
  OpenaireOrganization,
} from './types';

/**
 * OpenAIRE adapter (UC-622) — JSON wrapper over the OpenAIRE Graph API v1.
 * Scholarly research-literature graph: publications, datasets, software, projects,
 * and funding organizations aggregated from thousands of repositories worldwide.
 * No auth for unauthenticated reads (up to 60 req/hour per OpenAIRE terms of use).
 * https://api.openaire.eu/graph/v1
 */
export class OpenaireAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'openaire', baseUrl: 'https://api.openaire.eu/graph/v1' });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'openaire.search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('search', String(p.query));
        if (p.type) qs.set('type', String(p.type));
        const pageSize = Math.max(1, Math.min(50, Number(p.page_size ?? 10)));
        qs.set('pageSize', String(pageSize));
        qs.set('page', String(Math.max(1, Number(p.page ?? 1))));
        return { url: `${this.baseUrl}/researchProducts?${qs.toString()}`, method: 'GET', headers };
      }
      case 'openaire.product_details': {
        const id = encodeURIComponent(String(p.product_id));
        return { url: `${this.baseUrl}/researchProducts/${id}`, method: 'GET', headers };
      }
      case 'openaire.project_search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('search', String(p.query));
        const pageSize = Math.max(1, Math.min(50, Number(p.page_size ?? 10)));
        qs.set('pageSize', String(pageSize));
        qs.set('page', String(Math.max(1, Number(p.page ?? 1))));
        return { url: `${this.baseUrl}/projects?${qs.toString()}`, method: 'GET', headers };
      }
      case 'openaire.organization_search': {
        const qs = new URLSearchParams();
        if (p.query) qs.set('search', String(p.query));
        const pageSize = Math.max(1, Math.min(50, Number(p.page_size ?? 10)));
        qs.set('pageSize', String(pageSize));
        qs.set('page', String(Math.max(1, Number(p.page ?? 1))));
        return { url: `${this.baseUrl}/organizations?${qs.toString()}`, method: 'GET', headers };
      }
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    if (req.toolId === 'openaire.search') {
      const body = raw.body as OpenaireSearchResponse<OpenaireResearchProduct>;
      const results = body.results ?? [];
      return {
        total_found: body.header?.numFound ?? 0,
        returned: results.length,
        products: results.map(simplifyResearchProduct),
      };
    }

    if (req.toolId === 'openaire.product_details') {
      return simplifyResearchProduct(raw.body as OpenaireResearchProduct);
    }

    if (req.toolId === 'openaire.project_search') {
      const body = raw.body as OpenaireSearchResponse<OpenaireProject>;
      const results = body.results ?? [];
      return {
        total_found: body.header?.numFound ?? 0,
        returned: results.length,
        projects: results.map(simplifyProject),
      };
    }

    if (req.toolId === 'openaire.organization_search') {
      const body = raw.body as OpenaireSearchResponse<OpenaireOrganization>;
      const results = body.results ?? [];
      return {
        total_found: body.header?.numFound ?? 0,
        returned: results.length,
        organizations: results.map(simplifyOrganization),
      };
    }

    return raw.body;
  }
}

function simplifyResearchProduct(p: OpenaireResearchProduct): unknown {
  return {
    id: p.id,
    type: p.type,
    title: p.mainTitle,
    subtitle: p.subTitle,
    description: (p.descriptions ?? [])[0],
    authors: (p.authors ?? []).map((a) => a.fullName).filter(Boolean),
    publication_date: p.publicationDate,
    publisher: p.publisher,
    language: p.language?.label,
    access_right: p.bestAccessRight?.label,
    sources: p.sources,
    dois: (p.pids ?? [])
      .filter((pid) => pid.scheme === 'doi')
      .map((pid) => pid.value)
      .filter(Boolean),
  };
}

function simplifyProject(pr: OpenaireProject): unknown {
  return {
    id: pr.id,
    code: pr.code,
    acronym: pr.acronym,
    title: pr.title,
    website_url: pr.websiteUrl,
    start_date: pr.startDate,
    end_date: pr.endDate,
    call_identifier: pr.callIdentifier,
    keywords: pr.keywords,
    summary: pr.summary,
    funders: (pr.fundings ?? []).map((f) => ({
      short_name: f.shortName,
      name: f.name,
      jurisdiction: f.jurisdiction,
      funding_stream: f.fundingStream?.description,
    })),
  };
}

function simplifyOrganization(o: OpenaireOrganization): unknown {
  return {
    id: o.id,
    legal_short_name: o.legalShortName,
    legal_name: o.legalName,
    website_url: o.websiteUrl,
    alternative_names: o.alternativeNames,
    country: o.country?.label,
  };
}
