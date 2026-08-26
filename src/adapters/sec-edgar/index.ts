import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  SecCompanyConceptApiResponse,
  SecSubmissionsApiResponse,
  SecTickersFileRaw,
} from './types';

const SEC_WWW_BASE = 'https://www.sec.gov';
const SEC_DATA_BASE = 'https://data.sec.gov';

// SEC.gov fair-access policy requires a descriptive User-Agent identifying the
// requester (https://www.sec.gov/os/webmaster-faq#developers) — generic/blank
// User-Agent headers are throttled or blocked.
const SEC_USER_AGENT = 'APIbase.pro admin@apibase.pro';

const LOOKUP_DEFAULT_LIMIT = 10;
const LOOKUP_HARD_LIMIT = 25;
const FILINGS_DEFAULT_LIMIT = 10;
const FILINGS_HARD_LIMIT = 50;
const CONCEPT_DEFAULT_LIMIT = 20;
const CONCEPT_HARD_LIMIT = 100;

/**
 * SEC EDGAR company facts adapter (UC-612).
 *
 * Supported tools (read-only):
 *   sec-edgar.company_lookup    → GET www.sec.gov/files/company_tickers.json (filtered server-side)
 *   sec-edgar.filings           → GET data.sec.gov/submissions/CIK##########.json
 *   sec-edgar.financial_concept → GET data.sec.gov/api/xbrl/companyconcept/CIK##########/{taxonomy}/{tag}.json
 *
 * Auth: None (US Government open data, SEC EDGAR — Securities and Exchange
 * Commission public disclosure system). SEC requires a descriptive User-Agent
 * on every request (fair-access policy) but no API key or registration.
 *
 * company_tickers.json (~800KB, ~10K entries) is fetched and filtered
 * server-side per call rather than exposed raw — agents get only the matches
 * they asked for, same pattern as the enviroatlas static-table lookup.
 */
export class SecEdgarAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'sec-edgar',
      baseUrl: SEC_DATA_BASE,
      timeoutMs: 15_000,
      maxResponseBytes: 1_500_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': SEC_USER_AGENT,
    };

    switch (req.toolId) {
      case 'sec-edgar.company_lookup':
        return { url: `${SEC_WWW_BASE}/files/company_tickers.json`, method: 'GET', headers };
      case 'sec-edgar.filings': {
        const cik = normalizeCik(params.cik, req.toolId);
        return { url: `${SEC_DATA_BASE}/submissions/CIK${cik}.json`, method: 'GET', headers };
      }
      case 'sec-edgar.financial_concept': {
        const cik = normalizeCik(params.cik, req.toolId);
        const taxonomy = (params.taxonomy as string | undefined) ?? 'us-gaap';
        const tag = params.tag as string | undefined;
        if (!tag || !/^[A-Za-z][A-Za-z0-9]*$/.test(tag)) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message:
              'tag is required and must be a valid XBRL tag name (letters/digits only, e.g. "Assets", "Revenues").',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `${SEC_DATA_BASE}/api/xbrl/companyconcept/CIK${cik}/${encodeURIComponent(taxonomy)}/${encodeURIComponent(tag)}.json`,
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'sec-edgar.company_lookup': {
        const data = raw.body as unknown as SecTickersFileRaw;
        const query = String(params.query ?? '')
          .trim()
          .toLowerCase();
        const limit = clamp(params.limit, LOOKUP_DEFAULT_LIMIT, LOOKUP_HARD_LIMIT);

        const entries = Object.values(data);
        const exactTicker = entries.filter((e) => e.ticker.toLowerCase() === query);
        const substringMatch = entries.filter(
          (e) => e.ticker.toLowerCase() !== query && e.title.toLowerCase().includes(query),
        );
        const matches = [...exactTicker, ...substringMatch].slice(0, limit);

        return {
          matched_count: exactTicker.length + substringMatch.length,
          returned_count: matches.length,
          companies: matches.map((e) => ({
            cik: String(e.cik_str).padStart(10, '0'),
            ticker: e.ticker,
            name: e.title,
          })),
        };
      }
      case 'sec-edgar.filings': {
        const data = raw.body as unknown as SecSubmissionsApiResponse;
        const formType = (params.form_type as string | undefined)?.toUpperCase();
        const limit = clamp(params.limit, FILINGS_DEFAULT_LIMIT, FILINGS_HARD_LIMIT);
        const recent = data.filings?.recent;

        const total = recent?.form?.length ?? 0;
        const indices: number[] = [];
        for (let i = 0; i < total && indices.length < limit; i++) {
          if (!formType || recent.form[i]?.toUpperCase() === formType) {
            indices.push(i);
          }
        }

        return {
          cik: data.cik,
          name: data.name,
          sic_description: data.sicDescription,
          tickers: data.tickers ?? [],
          exchanges: data.exchanges ?? [],
          fiscal_year_end: data.fiscalYearEnd,
          returned_count: indices.length,
          filings: indices.map((i) => ({
            form: recent.form[i],
            filing_date: recent.filingDate[i],
            report_date: recent.reportDate[i],
            accession_number: recent.accessionNumber[i],
            primary_document: recent.primaryDocument[i],
            primary_doc_description: recent.primaryDocDescription[i],
            is_xbrl: Boolean(recent.isXBRL[i]),
            document_url: buildDocumentUrl(
              data.cik,
              recent.accessionNumber[i],
              recent.primaryDocument[i],
            ),
          })),
        };
      }
      case 'sec-edgar.financial_concept': {
        const data = raw.body as unknown as SecCompanyConceptApiResponse;
        const limit = clamp(params.limit, CONCEPT_DEFAULT_LIMIT, CONCEPT_HARD_LIMIT);
        const requestedUnit = params.unit as string | undefined;
        const unitKey =
          requestedUnit && data.units[requestedUnit]
            ? requestedUnit
            : data.units.USD
              ? 'USD'
              : Object.keys(data.units)[0];
        const entries = unitKey ? (data.units[unitKey] ?? []) : [];
        const sorted = [...entries].sort((a, b) => (a.end < b.end ? 1 : -1));
        const sliced = sorted.slice(0, limit);

        return {
          cik: data.cik,
          entity_name: data.entityName,
          taxonomy: data.taxonomy,
          tag: data.tag,
          label: data.label,
          unit: unitKey,
          returned_count: sliced.length,
          total_count: entries.length,
          values: sliced.map((e) => ({
            fiscal_year: e.fy,
            fiscal_period: e.fp,
            form: e.form,
            start_date: e.start,
            end_date: e.end,
            value: e.val,
            filed: e.filed,
          })),
        };
      }
      default:
        return raw.body;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeCik(value: unknown, toolId: string): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 10) {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message: 'cik is required and must be a numeric SEC Central Index Key (1-10 digits).',
      provider: 'sec-edgar',
      toolId,
      durationMs: 0,
    };
  }
  return digits.padStart(10, '0');
}

function buildDocumentUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  const cikNoLeadingZeros = String(Number(cik));
  const accnNoDashes = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accnNoDashes}/${primaryDocument}`;
}

function clamp(value: unknown, def: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.trunc(n), max);
}
