import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { EnsemblGeneLookupResponse, EnsemblSequenceRegionResponse } from './types';

/**
 * Ensembl REST API adapter (UC-440).
 *
 * Supported tools:
 *   ensembl.gene_lookup      → GET /lookup/symbol/{species}/{symbol}
 *   ensembl.sequence_region  → GET /sequence/region/{species}/{region}
 *
 * Auth: None (Apache 2.0, EMBL-EBI / Wellcome Sanger Institute, 55K req/hour).
 *
 * NOTE: VEP (variant consequence) and homology (ortholog/paralog search)
 * endpoints were evaluated but excluded — live testing showed inconsistent
 * cold-request latency (14-75s, frequent timeouts even at 30s) that is
 * incompatible with the platform's 10-15s provider-timeout budget.
 */
export class EnsemblAdapter extends BaseAdapter {
  private static readonly BASE = 'https://rest.ensembl.org';

  constructor() {
    super({
      provider: 'ensembl',
      baseUrl: EnsemblAdapter.BASE,
      timeoutMs: 15_000, // gene_lookup/sequence_region are normally <2s but can spike on cold requests
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    switch (req.toolId) {
      case 'ensembl.gene_lookup':
        return this.buildGeneLookup(params, headers);
      case 'ensembl.sequence_region':
        return this.buildSequenceRegion(params, headers);
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
      case 'ensembl.gene_lookup': {
        const gene = raw.body as EnsemblGeneLookupResponse;
        if (!gene.id) {
          throw new Error('Invalid Ensembl gene lookup response — missing id');
        }
        return {
          ensembl_id: gene.id,
          display_name: gene.display_name ?? null,
          description: gene.description ?? null,
          biotype: gene.biotype,
          species: gene.species,
          assembly: gene.assembly_name,
          chromosome: gene.seq_region_name,
          start: gene.start,
          end: gene.end,
          strand: gene.strand,
          canonical_transcript: gene.canonical_transcript ?? null,
          transcripts: (gene.Transcript ?? []).map((t) => ({
            id: t.id,
            biotype: t.biotype,
            is_canonical: Boolean(t.is_canonical),
            start: t.start,
            end: t.end,
          })),
        };
      }
      case 'ensembl.sequence_region': {
        const seq = raw.body as EnsemblSequenceRegionResponse;
        if (!seq.seq) {
          throw new Error('Invalid Ensembl sequence response — missing seq');
        }
        return {
          region: seq.query,
          assembly_region_id: seq.id,
          molecule: seq.molecule,
          sequence: seq.seq,
          length: seq.seq.length,
        };
      }
      default:
        return raw.body;
    }
  }

  private buildGeneLookup(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const species = String(params.species ?? '').trim();
    const symbol = String(params.symbol ?? '').trim();
    if (!species || !symbol) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: 'species and symbol are required (e.g. species="homo_sapiens", symbol="BRCA1")',
        provider: this.provider,
        toolId: 'ensembl.gene_lookup',
        durationMs: 0,
      };
    }
    const expand = params.expand === false ? '0' : '1';

    return {
      url: `${EnsemblAdapter.BASE}/lookup/symbol/${encodeURIComponent(species)}/${encodeURIComponent(symbol)}?expand=${expand}`,
      method: 'GET',
      headers,
    };
  }

  private buildSequenceRegion(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const species = String(params.species ?? '').trim();
    const region = String(params.region ?? '').trim();
    if (!species || !region) {
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message:
          'species and region are required (e.g. species="human", region="X:1000000-1000100")',
        provider: this.provider,
        toolId: 'ensembl.sequence_region',
        durationMs: 0,
      };
    }

    return {
      url: `${EnsemblAdapter.BASE}/sequence/region/${encodeURIComponent(species)}/${encodeURIComponent(region)}`,
      method: 'GET',
      headers,
    };
  }
}
