import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MyVariantQueryResult, MyVariantQueryHit, MyVariantMetadata } from './types';

/**
 * MyVariant.info adapter (UC-480).
 *
 * Supported tools:
 *   myvariant.search         → GET  myvariant.info/v1/query (variant search by rsID/gene/phenotype)
 *   myvariant.variant_info   → GET  myvariant.info/v1/variant/{id} (single variant annotation)
 *   myvariant.batch_variants → POST myvariant.info/v1/variant (batch by rsID/HGVS list)
 *   myvariant.metadata       → GET  myvariant.info/v1/metadata (API build info, source stats)
 *
 * Auth: None (BioThings open access, Scripps Research).
 */
export class MyVariantAdapter extends BaseAdapter {
  private static readonly BASE = 'https://myvariant.info/v1';
  private static readonly DEFAULT_FIELDS =
    'dbsnp,clinvar,cadd,gnomad_exome,gnomad_genome,snpeff,vcf,chrom,hg19';

  constructor() {
    super({
      provider: 'myvariant',
      baseUrl: 'https://myvariant.info/v1',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'myvariant.search':
        return this.buildSearch(params, headers);
      case 'myvariant.variant_info':
        return this.buildVariantInfo(params, headers);
      case 'myvariant.batch_variants':
        return this.buildBatchVariants(params, headers);
      case 'myvariant.metadata':
        return { url: `${MyVariantAdapter.BASE}/metadata`, method: 'GET', headers };
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

  private buildSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const q = encodeURIComponent(String(params.q));
    const size = params.size ? Number(params.size) : 10;
    const fields = params.fields
      ? encodeURIComponent(String(params.fields))
      : encodeURIComponent(MyVariantAdapter.DEFAULT_FIELDS);
    const assembly = params.assembly
      ? `&assembly=${encodeURIComponent(String(params.assembly))}`
      : '';
    const url = `${MyVariantAdapter.BASE}/query?q=${q}&size=${size}&fields=${fields}${assembly}`;
    return { url, method: 'GET', headers };
  }

  private buildVariantInfo(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const variantId = encodeURIComponent(String(params.variant_id));
    const fields = params.fields
      ? encodeURIComponent(String(params.fields))
      : encodeURIComponent(MyVariantAdapter.DEFAULT_FIELDS);
    const url = `${MyVariantAdapter.BASE}/variant/${variantId}?fields=${fields}`;
    return { url, method: 'GET', headers };
  }

  private buildBatchVariants(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const ids = String(params.ids);
    const fields = params.fields ? String(params.fields) : MyVariantAdapter.DEFAULT_FIELDS;
    const body = new URLSearchParams({ ids, fields }).toString();
    return {
      url: `${MyVariantAdapter.BASE}/variant`,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'myvariant.search':
        return this.parseQueryResult(body as unknown as MyVariantQueryResult);
      case 'myvariant.variant_info':
        return this.parseVariantHit(body as unknown as MyVariantQueryHit);
      case 'myvariant.batch_variants':
        return this.parseBatch(body as unknown as MyVariantQueryHit[]);
      case 'myvariant.metadata':
        return this.parseMetadata(body as unknown as MyVariantMetadata);
      default:
        return body;
    }
  }

  private parseQueryResult(data: MyVariantQueryResult) {
    return {
      total: data.total ?? 0,
      took_ms: data.took,
      variants: (data.hits ?? []).map((h) => this.normalizeHit(h)),
    };
  }

  private parseVariantHit(data: MyVariantQueryHit) {
    const raw = data as unknown as Record<string, unknown>;
    if (raw['success'] === false) {
      return {
        found: false,
        id: raw['error'] ?? 'not found',
        error: raw['error'],
      };
    }
    return { found: true, ...this.normalizeHit(data) };
  }

  private parseBatch(data: unknown) {
    const items = Array.isArray(data) ? data : [];
    return {
      count: items.length,
      variants: items.map((v) => {
        if ((v as Record<string, unknown>)['notfound']) {
          return { id: (v as Record<string, unknown>)['query'], found: false };
        }
        return { found: true, ...this.normalizeHit(v as MyVariantQueryHit) };
      }),
    };
  }

  private parseMetadata(data: MyVariantMetadata) {
    const src = data.src ?? {};
    const sources = Object.entries(src).map(([name, info]) => ({
      name,
      version: (info as Record<string, unknown>)['version'] ?? null,
      url: (info as Record<string, unknown>)['url'] ?? null,
      license_url: (info as Record<string, unknown>)['license_url'] ?? null,
    }));
    return {
      build_version: data.build_version,
      build_date: data.build_date,
      source_count: sources.length,
      sources,
    };
  }

  private normalizeHit(h: MyVariantQueryHit) {
    const clinvarRcv = Array.isArray(h.clinvar?.rcv) ? (h.clinvar?.rcv ?? []) : [];
    const clinvarSig = clinvarRcv.map((r) => r.clinical_significance).filter(Boolean);

    const conditions: string[] = [];
    for (const r of clinvarRcv) {
      const name = r.conditions?.name;
      if (typeof name === 'string') conditions.push(name);
      else if (Array.isArray(name)) conditions.push(...name);
    }

    const snpeffAnns = h.snpeff?.ann
      ? Array.isArray(h.snpeff.ann)
        ? h.snpeff.ann
        : [h.snpeff.ann]
      : [];

    return {
      id: h._id,
      score: h._score,
      chromosome: h.chrom,
      position_hg19: h.hg19 ? { start: h.hg19.start, end: h.hg19.end } : null,
      position_hg38: h.hg38 ? { start: h.hg38.start, end: h.hg38.end } : null,
      rsid: h.dbsnp?.rsid ?? null,
      ref: h.vcf?.ref ?? h.dbsnp?.ref ?? null,
      alt: h.vcf?.alt ?? h.dbsnp?.alt ?? null,
      variant_type: h.dbsnp?.vartype ?? null,
      cadd_phred: h.cadd?.phred ?? null,
      cadd_consequence: h.cadd?.consequence ?? null,
      clinvar_significance: clinvarSig.length > 0 ? clinvarSig : null,
      clinvar_conditions: conditions.length > 0 ? conditions : null,
      clinvar_gene: h.clinvar?.gene?.symbol ?? null,
      gnomad_af: h.gnomad_exome?.af?.af ?? h.gnomad_genome?.af?.af ?? null,
      functional_consequences: snpeffAnns.slice(0, 5).map((a) => ({
        effect: a.effect,
        impact: a.putative_impact,
        gene: a.gene_id,
        hgvs_c: a.hgvs_c,
        hgvs_p: a.hgvs_p,
      })),
    };
  }
}
