import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SparqlResults,
  SparqlBinding,
  EurLexAct,
  EurLexSearchOutput,
  EurLexDetailOutput,
  EurLexRecentOutput,
  EurLexByTypeOutput,
} from './types';

const SPARQL_ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';
const LANG_ENG = 'http://publications.europa.eu/resource/authority/language/ENG';
const CDM = 'http://publications.europa.eu/ontology/cdm#';

const PREFIXES = `PREFIX cdm: <${CDM}> `;

const DOC_TYPE_MAP: Record<string, string> = {
  regulation: 'R',
  directive: 'L',
  decision: 'D',
};

function val(b: Record<string, SparqlBinding>, key: string): string | undefined {
  return b[key]?.value;
}

function bindingToAct(b: Record<string, SparqlBinding>): EurLexAct {
  const celex = val(b, 'celex') ?? '';
  const cellarUri = val(b, 'work') ?? '';
  return {
    celex,
    date: val(b, 'date') ?? '',
    title: val(b, 'title') ?? null,
    in_force: b['inForce'] ? val(b, 'inForce') === 'true' : null,
    cellar_uri: cellarUri,
    eur_lex_url: celex ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}` : '',
  };
}

function buildSearchQuery(keyword: string, limit: number, from_date?: string): string {
  const kw = keyword.toLowerCase().replace(/"/g, '');
  const dateFilter = from_date
    ? `FILTER(?date >= "${from_date}"^^<http://www.w3.org/2001/XMLSchema#date>)`
    : '';
  return `${PREFIXES}
SELECT DISTINCT ?work ?celex ?date ?title ?inForce
WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_date_document ?date .
  ?expr cdm:expression_belongs_to_work ?work ;
        cdm:expression_uses_language <${LANG_ENG}> ;
        cdm:expression_title ?title .
  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce . }
  FILTER(STRSTARTS(STR(?celex), "3"))
  FILTER(CONTAINS(LCASE(STR(?title)), "${kw}"))
  ${dateFilter}
}
ORDER BY DESC(?date)
LIMIT ${limit}`;
}

function buildRecentQuery(limit: number, from_date: string): string {
  return `${PREFIXES}
SELECT DISTINCT ?work ?celex ?date ?title ?inForce
WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_date_document ?date .
  OPTIONAL {
    ?expr cdm:expression_belongs_to_work ?work ;
          cdm:expression_uses_language <${LANG_ENG}> ;
          cdm:expression_title ?title .
  }
  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce . }
  FILTER(STRSTARTS(STR(?celex), "3"))
  FILTER(?date >= "${from_date}"^^<http://www.w3.org/2001/XMLSchema#date>)
}
ORDER BY DESC(?date)
LIMIT ${limit}`;
}

function buildDetailQuery(celex: string): string {
  return `${PREFIXES}
SELECT ?work ?celex ?date ?title ?inForce
WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_date_document ?date .
  OPTIONAL {
    ?expr cdm:expression_belongs_to_work ?work ;
          cdm:expression_uses_language <${LANG_ENG}> ;
          cdm:expression_title ?title .
  }
  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce . }
  FILTER(STR(?celex) = "${celex.replace(/"/g, '')}")
}
LIMIT 1`;
}

function buildByTypeQuery(typeCode: string, limit: number, from_year?: number): string {
  const regex = `^3[0-9]{4}${typeCode}`;
  const yearFilter = from_year
    ? `FILTER(?date >= "${from_year}-01-01"^^<http://www.w3.org/2001/XMLSchema#date>)`
    : '';
  return `${PREFIXES}
SELECT DISTINCT ?work ?celex ?date ?title ?inForce
WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ?work cdm:work_date_document ?date .
  OPTIONAL {
    ?expr cdm:expression_belongs_to_work ?work ;
          cdm:expression_uses_language <${LANG_ENG}> ;
          cdm:expression_title ?title .
  }
  OPTIONAL { ?work cdm:resource_legal_in-force ?inForce . }
  FILTER(REGEX(STR(?celex), "${regex}"))
  ${yearFilter}
}
ORDER BY DESC(?date)
LIMIT ${limit}`;
}

/**
 * EUR-Lex Cellar SPARQL adapter (UC-587).
 *
 * Official EU Publications Office SPARQL endpoint for EU legislation.
 * Auth: None (public EU open data). No documented rate limits.
 * Protocol: SPARQL 1.1 via POST, application/x-www-form-urlencoded,
 *           Accept: application/sparql-results+json.
 */
export class EurLexAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'eurlex',
      baseUrl: SPARQL_ENDPOINT,
      timeoutMs: 15_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/sparql-results+json',
    };

    let sparql: string;

    switch (req.toolId) {
      case 'eurlex.legislation.search': {
        const keyword = String(params.keyword ?? '');
        if (!keyword.trim()) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'keyword is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const limit = Math.min(Number(params.limit) || 10, 20);
        const from_date = params.from_date ? String(params.from_date) : undefined;
        sparql = buildSearchQuery(keyword, limit, from_date);
        break;
      }

      case 'eurlex.legislation.recent': {
        const limit = Math.min(Number(params.limit) || 10, 20);
        const days = Math.min(Number(params.days) || 30, 365);
        const d = new Date();
        d.setDate(d.getDate() - days);
        const from_date = d.toISOString().slice(0, 10);
        sparql = buildRecentQuery(limit, from_date);
        break;
      }

      case 'eurlex.legislation.detail': {
        const celex = String(params.celex ?? '').trim();
        if (!celex) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'celex is required',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        sparql = buildDetailQuery(celex);
        break;
      }

      case 'eurlex.legislation.by_type': {
        const docType = String(params.doc_type ?? 'regulation').toLowerCase();
        const typeCode = DOC_TYPE_MAP[docType];
        if (!typeCode) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `doc_type must be one of: ${Object.keys(DOC_TYPE_MAP).join(', ')}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const limit = Math.min(Number(params.limit) || 10, 20);
        const from_year = params.from_year ? Number(params.from_year) : undefined;
        sparql = buildByTypeQuery(typeCode, limit, from_year);
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

    return {
      url: SPARQL_ENDPOINT,
      method: 'POST',
      headers,
      body: `query=${encodeURIComponent(sparql)}`,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const data = raw.body as SparqlResults;
    if (!data?.results?.bindings) {
      throw new Error('Invalid SPARQL response: missing results.bindings');
    }
    const bindings = data.results.bindings;

    switch (req.toolId) {
      case 'eurlex.legislation.search': {
        const params = req.params as Record<string, unknown>;
        const items = bindings.map(bindingToAct);
        const out: EurLexSearchOutput = {
          items,
          total: items.length,
          query: String(params.keyword ?? ''),
        };
        return out;
      }

      case 'eurlex.legislation.recent': {
        const params = req.params as Record<string, unknown>;
        const days = Math.min(Number(params.days) || 30, 365);
        const d = new Date();
        d.setDate(d.getDate() - days);
        const items = bindings.map(bindingToAct);
        const out: EurLexRecentOutput = {
          items,
          total: items.length,
          from_date: d.toISOString().slice(0, 10),
        };
        return out;
      }

      case 'eurlex.legislation.detail': {
        const params = req.params as Record<string, unknown>;
        if (bindings.length === 0) {
          return {
            celex: String(params.celex ?? ''),
            date: null,
            title: null,
            in_force: null,
            cellar_uri: null,
            eur_lex_url: null,
            found: false,
          };
        }
        const act = bindingToAct(bindings[0]);
        const out: EurLexDetailOutput = {
          ...act,
        };
        return out;
      }

      case 'eurlex.legislation.by_type': {
        const params = req.params as Record<string, unknown>;
        const items = bindings.map(bindingToAct);
        const out: EurLexByTypeOutput = {
          items,
          total: items.length,
          doc_type: String(params.doc_type ?? 'regulation'),
        };
        return out;
      }

      default:
        throw new Error(`Unsupported tool: ${req.toolId}`);
    }
  }
}
