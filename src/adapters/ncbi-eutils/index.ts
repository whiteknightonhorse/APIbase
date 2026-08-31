import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
  PROVIDER_BACKOFF_BASE_MS,
} from '../../types/provider';
import type {
  EutilsTaxonomySearchResponse,
  EutilsTaxonomySummaryResponse,
  EutilsTaxonomyLineage,
  EutilsLineageNode,
} from './types';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

const XML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
};

function decodeXmlEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m, ent) => XML_ENTITY_MAP[ent] ?? m);
}

/** Returns the text content of the FIRST occurrence of `<tag>...</tag>` in `xml`. */
function tagText(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`).exec(xml);
  return m ? decodeXmlEntities(m[1]) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * NCBI E-utilities Taxonomy API adapter (UC-647).
 *
 * eutils.ncbi.nlm.nih.gov is the public NCBI Entrez Programming Utilities gateway (US
 * National Library of Medicine, public domain, no signup required). This adapter wraps the
 * `taxonomy` database only — organism classification (kingdom -> species) — a distinct
 * capability from the PubMed literature search already covered by education.pubmed_search
 * (src/adapters/education), which hits the same eutils host with db=pubmed. Rate limit:
 * 3 req/sec without a key, 10 req/sec with an api_key — this adapter reuses
 * PROVIDER_KEY_NCBI (same NCBI account already used by the pubchem adapter) when present.
 *   ncbi-eutils.taxonomy_search  -> esearch: organism name -> list of NCBI TaxIDs
 *   ncbi-eutils.taxonomy_summary -> esummary: TaxID -> scientific/common name, rank, division
 *   ncbi-eutils.taxonomy_lineage -> efetch (XML): TaxID -> full classification tree (kingdom..species)
 *
 * efetch has no JSON mode for the taxonomy DB (retmode=xml only), so taxonomy_lineage
 * overrides call() and hand-parses the XML (same no-dependency pattern as
 * adbkidb/uklegislation) instead of adding an XML-parsing library.
 */
export class NcbiEutilsAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    super({ provider: 'ncbi-eutils', baseUrl: EUTILS_BASE });
    this.apiKey = apiKey ?? '';
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }

  private requiredString(params: Record<string, unknown>, field: string, toolId: string): string {
    const value = params[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      this.invalidInput(toolId, `${field} is required`);
    }
    return String(value).trim();
  }

  private requireTaxId(params: Record<string, unknown>, toolId: string): string {
    const taxId = this.requiredString(params, 'tax_id', toolId);
    if (!/^\d+$/.test(taxId)) {
      this.invalidInput(toolId, 'tax_id must be a numeric NCBI Taxonomy ID');
    }
    return taxId;
  }

  override async call(req: ProviderRequest): Promise<ProviderRawResponse> {
    if (req.toolId === 'ncbi-eutils.taxonomy_lineage') {
      return this.callLineage(req);
    }
    return super.call(req);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ncbi-eutils.taxonomy_search': {
        const query = this.requiredString(params, 'query', req.toolId);
        const retmaxRaw = params.retmax;
        let retmax = 20;
        if (retmaxRaw !== undefined) {
          const n = Number(retmaxRaw);
          if (!Number.isFinite(n) || n < 1 || n > 50) {
            this.invalidInput(req.toolId, 'retmax must be between 1 and 50');
          }
          retmax = Math.floor(n);
        }
        const qs = new URLSearchParams({
          db: 'taxonomy',
          term: query,
          retmode: 'json',
          retmax: String(retmax),
        });
        if (this.apiKey) qs.set('api_key', this.apiKey);
        return { url: `${EUTILS_BASE}/esearch.fcgi?${qs.toString()}`, method: 'GET', headers };
      }

      case 'ncbi-eutils.taxonomy_summary': {
        const taxId = this.requireTaxId(params, req.toolId);
        const qs = new URLSearchParams({ db: 'taxonomy', id: taxId, retmode: 'json' });
        if (this.apiKey) qs.set('api_key', this.apiKey);
        return { url: `${EUTILS_BASE}/esummary.fcgi?${qs.toString()}`, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'ncbi-eutils.taxonomy_search': {
        const body = raw.body as EutilsTaxonomySearchResponse;
        const result = body.esearchresult ?? {};
        if (result.ERROR) {
          this.invalidInput(req.toolId, result.ERROR);
        }
        return {
          count: result.count ? parseInt(result.count, 10) : 0,
          tax_ids: result.idlist ?? [],
          query_translation: result.querytranslation ?? null,
          unmatched_terms: result.errorlist?.phrasesnotfound ?? [],
        };
      }

      case 'ncbi-eutils.taxonomy_summary': {
        const body = raw.body as EutilsTaxonomySummaryResponse;
        const uid = body.result?.uids?.[0];
        const summary = uid ? body.result[uid] : undefined;
        if (!summary || Array.isArray(summary) || summary.error) {
          return { tax_id: uid ?? null, found: false };
        }
        return {
          tax_id: summary.uid,
          found: true,
          scientific_name: summary.scientificname ?? null,
          common_name: summary.commonname || null,
          rank: summary.rank ?? null,
          division: summary.division ?? null,
          genbank_division: summary.genbankdivision ?? null,
          status: summary.status ?? null,
        };
      }

      default:
        return raw.body;
    }
  }

  private async callLineage(req: ProviderRequest): Promise<ProviderRawResponse> {
    const start = performance.now();
    const params = (req.params ?? {}) as Record<string, unknown>;
    const taxId = this.requireTaxId(params, req.toolId);

    const qs = new URLSearchParams({ db: 'taxonomy', id: taxId, retmode: 'xml' });
    if (this.apiKey) qs.set('api_key', this.apiKey);
    const url = `${EUTILS_BASE}/efetch.fcgi?${qs.toString()}`;

    const xmlText = await this.fetchXml(url, req);
    const body = this.parseLineageXml(xmlText, taxId);

    return {
      status: 200,
      headers: {},
      body,
      durationMs: Math.round(performance.now() - start),
      byteLength: Buffer.byteLength(xmlText, 'utf8'),
    };
  }

  private async fetchXml(url: string, req: ProviderRequest): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(PROVIDER_BACKOFF_BASE_MS * Math.pow(2, attempt - 1));
      }

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/xml' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.status === 429) {
          throw {
            code: ProviderErrorCode.RATE_LIMIT,
            httpStatus: 429,
            message: 'NCBI E-utilities rate limit exceeded',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status >= 500) {
          throw {
            code: ProviderErrorCode.UNAVAILABLE,
            httpStatus: 502,
            message: `NCBI E-utilities returned ${response.status}`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        if (response.status >= 400) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `NCBI E-utilities rejected the request (HTTP ${response.status})`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }

        return await response.text();
      } catch (error) {
        const err = error as { code?: string };
        lastError = error;
        if (
          err.code === ProviderErrorCode.UNAVAILABLE ||
          err.code === ProviderErrorCode.RATE_LIMIT
        ) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  /** Hand-parses the efetch taxonomy XML — top-level Taxon fields precede <LineageEx> in
   *  document order, so a non-global tagText() match always picks the outer taxon's value,
   *  never a nested LineageEx sub-taxon's. */
  private parseLineageXml(xml: string, taxId: string): EutilsTaxonomyLineage {
    if (!/<TaxId>/.test(xml)) {
      return { tax_id: taxId, found: false };
    }

    const lineage: EutilsLineageNode[] = [];
    const lineageExMatch = /<LineageEx>([\s\S]*?)<\/LineageEx>/.exec(xml);
    if (lineageExMatch) {
      const taxonRegex = /<Taxon>([\s\S]*?)<\/Taxon>/g;
      let m: RegExpExecArray | null;
      while ((m = taxonRegex.exec(lineageExMatch[1])) !== null) {
        const node = m[1];
        lineage.push({
          tax_id: tagText(node, 'TaxId') ?? '',
          scientific_name: tagText(node, 'ScientificName') ?? '',
          rank: tagText(node, 'Rank') ?? '',
        });
      }
    }

    return {
      tax_id: taxId,
      found: true,
      scientific_name: tagText(xml, 'ScientificName'),
      common_name: tagText(xml, 'GenbankCommonName'),
      rank: tagText(xml, 'Rank'),
      division: tagText(xml, 'Division'),
      parent_tax_id: tagText(xml, 'ParentTaxId'),
      lineage_text: tagText(xml, 'Lineage'),
      lineage,
    };
  }
}
