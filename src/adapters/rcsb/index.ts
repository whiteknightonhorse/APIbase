import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  RcsbSearchResult,
  RcsbEntryResponse,
  RcsbChemCompResponse,
} from './types';

/**
 * RCSB Protein Data Bank adapter (UC-218).
 *
 * Supported tools:
 *   pdb.search     → POST search.rcsb.org/rcsbsearch/v2/query (full-text)
 *   pdb.structure  → GET  data.rcsb.org/rest/v1/core/entry/{id}
 *   pdb.ligand     → GET  data.rcsb.org/rest/v1/core/chemcomp/{id}
 *   pdb.sequence   → POST search.rcsb.org/rcsbsearch/v2/query (sequence)
 *
 * Auth: None (CC0 open data, unlimited).
 */
export class RcsbAdapter extends BaseAdapter {
  private static readonly SEARCH_BASE = 'https://search.rcsb.org/rcsbsearch/v2/query';
  private static readonly DATA_BASE = 'https://data.rcsb.org/rest/v1/core';

  constructor() {
    super({
      provider: 'rcsb',
      baseUrl: 'https://data.rcsb.org',
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
      Accept: 'application/json',
    };

    switch (req.toolId) {
      case 'pdb.search':
        return this.buildSearch(params, headers);
      case 'pdb.structure':
        return this.buildStructure(params, headers);
      case 'pdb.ligand':
        return this.buildLigand(params, headers);
      case 'pdb.sequence':
        return this.buildSequence(params, headers);
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
      case 'pdb.search':
      case 'pdb.sequence': {
        const data = body as unknown as RcsbSearchResult;
        return {
          total_count: data.total_count ?? 0,
          results: (data.result_set ?? []).map((r) => ({
            pdb_id: r.identifier,
            score: r.score,
          })),
        };
      }
      case 'pdb.structure': {
        const entry = body as unknown as RcsbEntryResponse;
        if (!entry.rcsb_id) {
          throw new Error('Invalid PDB entry response — missing rcsb_id');
        }
        return {
          pdb_id: entry.rcsb_id,
          title: entry.struct?.title ?? '',
          method: entry.exptl?.[0]?.method ?? 'unknown',
          resolution: entry.rcsb_entry_info?.resolution_combined?.[0] ?? null,
          molecular_weight: entry.rcsb_entry_info?.molecular_weight ?? null,
          protein_chains: entry.rcsb_entry_info?.polymer_entity_count_protein ?? 0,
          dna_chains: entry.rcsb_entry_info?.polymer_entity_count_DNA ?? 0,
          rna_chains: entry.rcsb_entry_info?.polymer_entity_count_RNA ?? 0,
          assembly_count: entry.rcsb_entry_info?.assembly_count ?? 0,
          deposit_date: entry.rcsb_accession_info?.deposit_date ?? '',
          release_date: entry.rcsb_accession_info?.initial_release_date ?? '',
          citation: entry.rcsb_primary_citation ? {
            title: entry.rcsb_primary_citation.title ?? '',
            journal: entry.rcsb_primary_citation.journal_abbrev ?? '',
            year: entry.rcsb_primary_citation.year ?? null,
            doi: entry.rcsb_primary_citation.pdbx_database_id_DOI ?? null,
            pubmed_id: entry.rcsb_primary_citation.pdbx_database_id_PubMed ?? null,
            authors: entry.rcsb_primary_citation.rcsb_authors ?? [],
          } : null,
        };
      }
      case 'pdb.ligand': {
        const comp = body as unknown as RcsbChemCompResponse;
        if (!comp.chem_comp) {
          throw new Error('Invalid chemical component response — missing chem_comp');
        }
        return {
          ligand_id: comp.rcsb_id,
          name: comp.chem_comp.name,
          formula: comp.chem_comp.formula,
          molecular_weight: comp.chem_comp.formula_weight,
          type: comp.chem_comp.type,
          formal_charge: comp.chem_comp.pdbx_formal_charge ?? 0,
          heavy_atoms: comp.rcsb_chem_comp_info?.atom_count_heavy ?? null,
          bond_count: comp.rcsb_chem_comp_info?.bond_count ?? null,
          descriptors: comp.rcsb_chem_comp_descriptor
            ? {
                smiles: comp.rcsb_chem_comp_descriptor.smiles ?? null,
                smiles_stereo: comp.rcsb_chem_comp_descriptor.smilesstereo ?? null,
                inchi: comp.rcsb_chem_comp_descriptor.in_ch_i ?? null,
                inchi_key: comp.rcsb_chem_comp_descriptor.in_ch_ikey ?? null,
              }
            : null,
        };
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearch(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const query = String(params.query ?? '');
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);
    const method = (params.method as string) || 'full_text';

    headers['Content-Type'] = 'application/json';

    const body = {
      query: {
        type: 'terminal',
        service: method === 'structure' ? 'structure' : 'full_text',
        parameters: { value: query },
      },
      return_type: 'entry',
      request_options: {
        results_content_type: ['experimental'],
        paginate: { start: 0, rows: limit },
      },
    };

    return {
      url: RcsbAdapter.SEARCH_BASE,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
  }

  private buildStructure(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const pdbId = String(params.pdb_id ?? '').toUpperCase();
    if (!pdbId || pdbId.length !== 4) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 400,
        message: 'pdb_id must be a 4-character PDB identifier (e.g. 4HHB)',
        provider: this.provider,
        toolId: 'pdb.structure',
        durationMs: 0,
      };
    }

    return {
      url: `${RcsbAdapter.DATA_BASE}/entry/${pdbId}`,
      method: 'GET',
      headers,
    };
  }

  private buildLigand(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const ligandId = String(params.ligand_id ?? '').toUpperCase();
    if (!ligandId) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 400,
        message: 'ligand_id is required (e.g. ATP, HEM, NAG)',
        provider: this.provider,
        toolId: 'pdb.ligand',
        durationMs: 0,
      };
    }

    return {
      url: `${RcsbAdapter.DATA_BASE}/chemcomp/${ligandId}`,
      method: 'GET',
      headers,
    };
  }

  private buildSequence(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const sequence = String(params.sequence ?? '');
    const identity = Math.min(Math.max(Number(params.identity_cutoff) || 0.9, 0.1), 1.0);
    const evalue = Number(params.evalue_cutoff) || 0.1;
    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 50);

    headers['Content-Type'] = 'application/json';

    const body = {
      query: {
        type: 'terminal',
        service: 'sequence',
        parameters: {
          evalue_cutoff: evalue,
          identity_cutoff: identity,
          sequence_type: 'protein',
          value: sequence,
        },
      },
      return_type: 'polymer_entity',
      request_options: {
        results_content_type: ['experimental'],
        paginate: { start: 0, rows: limit },
      },
    };

    return {
      url: RcsbAdapter.SEARCH_BASE,
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
  }
}
