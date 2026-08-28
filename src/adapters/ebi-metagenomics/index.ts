import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  type ProviderError,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MgnifyStudiesListResponse,
  MgnifyStudyDetailResponse,
  MgnifySamplesListResponse,
  MgnifyBiomesListResponse,
} from './types';

const EBI_METAGENOMICS_BASE = 'https://www.ebi.ac.uk/metagenomics/api/v1';

/**
 * EBI Metagenomics / MGnify API adapter (UC-624).
 *
 * Public, no-auth JSON:API over EMBL-EBI's metagenomics analysis archive (MGnify) —
 * 5,000+ studies, samples, and their environmental/biome classification.
 * Docs: https://www.ebi.ac.uk/metagenomics/api/v1/docs/
 *   ebi-metagenomics.study_search  -> GET /studies
 *   ebi-metagenomics.study_detail  -> GET /studies/{accession}
 *   ebi-metagenomics.sample_list   -> GET /studies/{accession}/samples
 *   ebi-metagenomics.biome_browse  -> GET /biomes/{lineage}/children
 *
 * QUIRK: /biomes/{lineage}/children returns the queried biome plus its ENTIRE descendant
 * subtree (e.g. "root" returns all 492 biomes), not just immediate children — the tool
 * description is written to make this explicit so agents don't assume a shallow listing.
 *
 * SCOPE NOTE: analysis-level taxonomic/functional annotation endpoints
 * (/analyses/{id}/taxonomy, /kegg-modules, etc.) were tested live during onboarding
 * and returned empty result sets for representative analyses — same "unreliable
 * enough to skip" class as UC-440 Ensembl's dropped VEP/homology tools. Scope kept
 * to the study/sample/biome endpoints that consistently returned real data.
 *
 * Rate limit: no documented rate limit found in the public API docs; no
 * X-RateLimit-* headers observed on live responses.
 */
export class EbiMetagenomicsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ebi-metagenomics', baseUrl: EBI_METAGENOMICS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ebi-metagenomics.study_search':
        return this.buildStudySearchRequest(params, headers);
      case 'ebi-metagenomics.study_detail':
        return this.buildStudyDetailRequest(params, headers);
      case 'ebi-metagenomics.sample_list':
        return this.buildSampleListRequest(params, headers);
      case 'ebi-metagenomics.biome_browse':
        return this.buildBiomeBrowseRequest(params, headers);
      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported tool: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        } satisfies ProviderError;
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'ebi-metagenomics.study_search': {
        const data = raw.body as unknown as MgnifyStudiesListResponse;
        return {
          total_results: data.meta?.pagination?.count ?? data.data.length,
          page: data.meta?.pagination?.page ?? 1,
          results: (data.data ?? []).map((s) => ({
            accession: s.attributes.accession,
            study_name: s.attributes['study-name'] ?? null,
            study_abstract: s.attributes['study-abstract'] ?? null,
            bioproject: s.attributes.bioproject ?? null,
            secondary_accession: s.attributes['secondary-accession'] ?? null,
            centre_name: s.attributes['centre-name'] ?? null,
            samples_count: s.attributes['samples-count'] ?? 0,
            last_update: s.attributes['last-update'] ?? null,
            biomes: (s.relationships?.biomes?.data ?? []).map((b) => b.id),
          })),
        };
      }
      case 'ebi-metagenomics.study_detail': {
        const data = raw.body as unknown as MgnifyStudyDetailResponse;
        const s = data.data;
        return {
          accession: s.attributes.accession,
          study_name: s.attributes['study-name'] ?? null,
          study_abstract: s.attributes['study-abstract'] ?? null,
          bioproject: s.attributes.bioproject ?? null,
          secondary_accession: s.attributes['secondary-accession'] ?? null,
          centre_name: s.attributes['centre-name'] ?? null,
          samples_count: s.attributes['samples-count'] ?? 0,
          is_private: Boolean(s.attributes['is-private']),
          last_update: s.attributes['last-update'] ?? null,
          public_release_date: s.attributes['public-release-date'] ?? null,
          data_origination: s.attributes['data-origination'] ?? null,
          biomes: (s.relationships?.biomes?.data ?? []).map((b) => b.id),
        };
      }
      case 'ebi-metagenomics.sample_list': {
        const data = raw.body as unknown as MgnifySamplesListResponse;
        return {
          total_results: data.meta?.pagination?.count ?? data.data.length,
          page: data.meta?.pagination?.page ?? 1,
          results: (data.data ?? []).map((sm) => ({
            accession: sm.attributes.accession,
            sample_name: sm.attributes['sample-name'] ?? null,
            sample_alias: sm.attributes['sample-alias'] ?? null,
            sample_desc: sm.attributes['sample-desc'] ?? null,
            biosample: sm.attributes.biosample ?? null,
            latitude: sm.attributes.latitude ?? null,
            longitude: sm.attributes.longitude ?? null,
            geo_loc_name: sm.attributes['geo-loc-name'] ?? null,
            collection_date: sm.attributes['collection-date'] ?? null,
            environment_biome: sm.attributes['environment-biome'] ?? null,
            environment_feature: sm.attributes['environment-feature'] ?? null,
            environment_material: sm.attributes['environment-material'] ?? null,
            host_tax_id: sm.attributes['host-tax-id'] ?? null,
            species: sm.attributes.species ?? null,
            last_update: sm.attributes['last-update'] ?? null,
            sample_metadata: (sm.attributes['sample-metadata'] ?? []).map((m) => ({
              key: m.key,
              value: m.value,
            })),
          })),
        };
      }
      case 'ebi-metagenomics.biome_browse': {
        const data = raw.body as unknown as MgnifyBiomesListResponse;
        return {
          total_results: data.meta?.pagination?.count ?? data.data.length,
          page: data.meta?.pagination?.page ?? 1,
          results: (data.data ?? []).map((b) => ({
            lineage: b.attributes.lineage,
            biome_name: b.attributes['biome-name'] ?? null,
            samples_count: b.attributes['samples-count'] ?? 0,
          })),
        };
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildStudySearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    const query = params.query !== undefined ? String(params.query).trim() : '';
    const lineage = params.biome_lineage !== undefined ? String(params.biome_lineage).trim() : '';
    if (query) qs.set('search', query);
    if (lineage) qs.set('lineage', lineage);
    qs.set('page', String(this.clampPage(params.page)));
    qs.set('page_size', String(this.clampPerPage(params.page_size, 10, 25)));

    return { url: `${EBI_METAGENOMICS_BASE}/studies?${qs}`, method: 'GET', headers };
  }

  private buildStudyDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const accession = params.accession !== undefined ? String(params.accession).trim() : '';
    if (!accession)
      throw this.invalidInput('ebi-metagenomics.study_detail', 'accession is required');

    return {
      url: `${EBI_METAGENOMICS_BASE}/studies/${encodeURIComponent(accession)}`,
      method: 'GET',
      headers,
    };
  }

  private buildSampleListRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const accession =
      params.study_accession !== undefined ? String(params.study_accession).trim() : '';
    if (!accession)
      throw this.invalidInput('ebi-metagenomics.sample_list', 'study_accession is required');

    const qs = new URLSearchParams();
    qs.set('page', String(this.clampPage(params.page)));
    qs.set('page_size', String(this.clampPerPage(params.page_size, 10, 50)));

    return {
      url: `${EBI_METAGENOMICS_BASE}/studies/${encodeURIComponent(accession)}/samples?${qs}`,
      method: 'GET',
      headers,
    };
  }

  private buildBiomeBrowseRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const lineage = params.lineage !== undefined ? String(params.lineage).trim() : 'root';

    const qs = new URLSearchParams();
    qs.set('page', String(this.clampPage(params.page)));
    qs.set('page_size', String(this.clampPerPage(params.page_size, 20, 50)));

    return {
      url: `${EBI_METAGENOMICS_BASE}/biomes/${encodeURIComponent(lineage)}/children?${qs}`,
      method: 'GET',
      headers,
    };
  }

  private clampPage(value: unknown): number {
    const n = value !== undefined ? Number(value) : 1;
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.trunc(n));
  }

  private clampPerPage(value: unknown, fallback: number, max: number): number {
    const n = value !== undefined ? Number(value) : fallback;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(1, Math.trunc(n)));
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    } satisfies ProviderError;
  }
}
