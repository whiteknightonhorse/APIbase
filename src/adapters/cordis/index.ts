import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SparqlResult,
  SparqlBinding,
  CordisProjectSummary,
  CordisProjectSearchOutput,
  CordisProjectDetail,
  CordisOrgParticipant,
  CordisOrgResult,
  CordisOrgSearchOutput,
  CordisPublicationsOutput,
} from './types';

const CORDIS_SPARQL = 'https://cordis.europa.eu/datalab/sparql';
const EURIO = 'http://data.europa.eu/s66#';

function val(b: SparqlBinding, key: string): string | null {
  return b[key]?.value ?? null;
}

function buildSparqlUrl(query: string): string {
  return `${CORDIS_SPARQL}?query=${encodeURIComponent(query)}`;
}

/**
 * CORDIS adapter (UC-549).
 *
 * EU Community Research and Development Information Service — 80K+ Horizon/H2020 projects.
 * Access via EURIO SPARQL endpoint. No auth, open data.
 */
export class CordisAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'cordis', baseUrl: CORDIS_SPARQL, timeoutMs: 15000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'cordis.project_search': {
        const query = String(params.query ?? '');
        const limit = Math.min(Number(params.limit) || 10, 20);
        const status = params.status ? String(params.status) : null;
        const yearFrom = params.year_from ? String(params.year_from) : null;
        const yearTo = params.year_to ? String(params.year_to) : null;

        const filters: string[] = [];
        filters.push(
          `FILTER(CONTAINS(LCASE(str(?title)), "${query.toLowerCase().replace(/"/g, '')}"))`,
        );
        if (status) filters.push(`FILTER(str(?status) = "${status}")`);
        if (yearFrom) filters.push(`FILTER(?startDate >= "${yearFrom}-01-01"^^xsd:date)`);
        if (yearTo) filters.push(`FILTER(?startDate <= "${yearTo}-12-31"^^xsd:date)`);

        const sparql = `PREFIX eurio: <${EURIO}>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?id ?rcn ?title ?startDate ?endDate ?status WHERE {
  ?p a eurio:Project ;
     eurio:identifier ?id ;
     eurio:title ?title .
  OPTIONAL { ?p eurio:rcn ?rcn }
  OPTIONAL { ?p eurio:startDate ?startDate }
  OPTIONAL { ?p eurio:endDate ?endDate }
  OPTIONAL { ?p eurio:projectStatus ?status }
  ${filters.join('\n  ')}
} LIMIT ${limit}`;

        return { url: buildSparqlUrl(sparql), method: 'GET', headers };
      }

      case 'cordis.project_details': {
        const grantId = String(params.grant_id ?? '').replace(/"/g, '');

        const sparql = `PREFIX eurio: <${EURIO}>
SELECT ?title ?abstract ?startDate ?endDate ?status ?rcn ?acronym ?totalCost ?duration ?signatureDate ?url WHERE {
  ?p a eurio:Project ;
     eurio:identifier "${grantId}" ;
     eurio:title ?title .
  OPTIONAL { ?p eurio:abstract ?abstract }
  OPTIONAL { ?p eurio:startDate ?startDate }
  OPTIONAL { ?p eurio:endDate ?endDate }
  OPTIONAL { ?p eurio:projectStatus ?status }
  OPTIONAL { ?p eurio:rcn ?rcn }
  OPTIONAL { ?p eurio:hasAcronym ?acr . ?acr eurio:identifier ?acronym }
  OPTIONAL { ?p eurio:duration ?duration }
  OPTIONAL { ?p eurio:signatureDate ?signatureDate }
  OPTIONAL { ?p eurio:url ?url }
  OPTIONAL {
    ?p eurio:hasTotalCost ?tc .
    ?tc eurio:amount ?totalCost
  }
}`;

        return { url: buildSparqlUrl(sparql), method: 'GET', headers };
      }

      case 'cordis.project_details_orgs': {
        const grantId = String(params.grant_id ?? '').replace(/"/g, '');

        const sparql = `PREFIX eurio: <${EURIO}>
SELECT ?orgName ?roleLabel WHERE {
  ?p a eurio:Project ;
     eurio:identifier "${grantId}" ;
     eurio:hasInvolvedParty ?role .
  ?role eurio:roleLabel ?roleLabel ;
        eurio:isRoleOf ?org .
  ?org eurio:legalName ?orgName .
} LIMIT 50`;

        return { url: buildSparqlUrl(sparql), method: 'GET', headers };
      }

      case 'cordis.organisation_search': {
        const name = String(params.name ?? '')
          .toLowerCase()
          .replace(/"/g, '');
        const country = params.country ? String(params.country).toUpperCase() : null;
        const limit = Math.min(Number(params.limit) || 10, 20);

        const filters: string[] = [];
        if (name) filters.push(`FILTER(CONTAINS(LCASE(?name), "${name}"))`);
        if (country) filters.push(`FILTER(str(?country) = "${country}")`);

        const sparql = `PREFIX eurio: <${EURIO}>
SELECT DISTINCT ?id ?rcn ?name ?country ?url ?type WHERE {
  ?o a ?type ;
     eurio:legalName ?name ;
     eurio:identifier ?id .
  VALUES ?type { eurio:Organisation eurio:ForProfitOrganisation eurio:SME }
  OPTIONAL { ?o eurio:rcn ?rcn }
  OPTIONAL { ?o eurio:country ?country }
  OPTIONAL { ?o eurio:url ?url }
  ${filters.join('\n  ')}
} LIMIT ${limit}`;

        return { url: buildSparqlUrl(sparql), method: 'GET', headers };
      }

      case 'cordis.project_publications': {
        const query = String(params.query ?? '')
          .toLowerCase()
          .replace(/"/g, '');
        const projectId = params.project_id ? String(params.project_id).replace(/"/g, '') : null;
        const limit = Math.min(Number(params.limit) || 10, 20);

        const filters: string[] = [];
        if (query) filters.push(`FILTER(CONTAINS(LCASE(str(?title)), "${query}"))`);

        const projectJoin = projectId
          ? `?proj a eurio:Project ; eurio:identifier "${projectId}" ; eurio:hasResult ?r .`
          : '?proj a eurio:Project ; eurio:hasResult ?r .';

        const sparql = `PREFIX eurio: <${EURIO}>
SELECT DISTINCT ?id ?title ?doi ?date ?rcn WHERE {
  ?r a eurio:ProjectPublication ;
     eurio:identifier ?id ;
     eurio:title ?title .
  OPTIONAL { ?r eurio:doi ?doi }
  OPTIONAL { ?r eurio:contentCreationDate ?date }
  OPTIONAL {
    ${projectJoin}
    ?proj eurio:rcn ?rcn
  }
  ${filters.join('\n  ')}
} LIMIT ${limit}`;

        return { url: buildSparqlUrl(sparql), method: 'GET', headers };
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
    const body = raw.body as SparqlResult;
    const bindings = body?.results?.bindings ?? [];

    switch (req.toolId) {
      case 'cordis.project_search': {
        const seen = new Set<string>();
        const results: CordisProjectSummary[] = [];
        for (const b of bindings) {
          const id = val(b, 'id');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          results.push({
            id,
            rcn: val(b, 'rcn') ?? '',
            title: val(b, 'title') ?? '',
            start_date: val(b, 'startDate'),
            end_date: val(b, 'endDate'),
            status: val(b, 'status'),
          });
        }
        const out: CordisProjectSearchOutput = { total: results.length, results };
        return out;
      }

      case 'cordis.project_details': {
        if (bindings.length === 0) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message:
              'Project not found — check the grant_id (9-digit Horizon Europe agreement number)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        const b = bindings[0];
        const params = req.params as Record<string, unknown>;
        const grantId = String(params.grant_id ?? '');
        const out: CordisProjectDetail = {
          id: grantId,
          rcn: val(b, 'rcn') ?? '',
          title: val(b, 'title') ?? '',
          acronym: val(b, 'acronym'),
          abstract: val(b, 'abstract'),
          start_date: val(b, 'startDate'),
          end_date: val(b, 'endDate'),
          status: val(b, 'status'),
          total_cost_eur: val(b, 'totalCost') ? Number(val(b, 'totalCost')) : null,
          duration_months: val(b, 'duration') ? Number(val(b, 'duration')) : null,
          signature_date: val(b, 'signatureDate'),
          url: `https://cordis.europa.eu/project/id/${grantId}`,
          organisations: [],
        };
        return out;
      }

      case 'cordis.project_details_orgs': {
        const orgs: CordisOrgParticipant[] = [];
        for (const b of bindings) {
          const name = val(b, 'orgName');
          const role = val(b, 'roleLabel');
          if (name) orgs.push({ name, role: role ?? 'participant' });
        }
        return orgs;
      }

      case 'cordis.organisation_search': {
        const seen = new Set<string>();
        const results: CordisOrgResult[] = [];
        for (const b of bindings) {
          const id = val(b, 'id');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const typeUri = val(b, 'type') ?? '';
          const type = typeUri.split('#').pop() ?? null;
          results.push({
            id,
            rcn: val(b, 'rcn') ?? '',
            name: val(b, 'name') ?? '',
            country: val(b, 'country'),
            url: val(b, 'url'),
            type,
          });
        }
        const out: CordisOrgSearchOutput = { total: results.length, results };
        return out;
      }

      case 'cordis.project_publications': {
        const seen = new Set<string>();
        const results: Array<{
          id: string;
          title: string;
          doi: string | null;
          publication_date: string | null;
          project_rcn: string | null;
        }> = [];
        for (const b of bindings) {
          const id = val(b, 'id');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          results.push({
            id,
            title: val(b, 'title') ?? '',
            doi: val(b, 'doi'),
            publication_date: val(b, 'date'),
            project_rcn: val(b, 'rcn'),
          });
        }
        const out: CordisPublicationsOutput = { total: results.length, results };
        return out;
      }

      default:
        return bindings;
    }
  }

  /**
   * CORDIS has a two-step project detail fetch:
   * first get the main fields, then get organisation participants.
   * Override call() to merge both SPARQL results.
   */
  async call(req: ProviderRequest) {
    if (req.toolId !== 'cordis.project_details') {
      return super.call(req);
    }

    // Fetch main project fields
    const mainRaw = await super.call(req);
    const detail = mainRaw.body as CordisProjectDetail;

    // Fetch organisations via a secondary request
    try {
      const orgReq: ProviderRequest = {
        ...req,
        toolId: 'cordis.project_details_orgs',
      };
      const orgRaw = await super.call(orgReq);
      detail.organisations = (orgRaw.body as CordisOrgParticipant[]) ?? [];
    } catch {
      // orgs are optional — don't fail the whole request
      detail.organisations = [];
    }

    mainRaw.body = detail;
    return mainRaw;
  }
}
