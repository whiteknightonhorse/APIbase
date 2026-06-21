import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MyChemQueryResult, MyChemQueryHit, MyChemMetadata } from './types';

/**
 * MyChem.info adapter (UC-481).
 *
 * Supported tools:
 *   mychem.search        → GET  mychem.info/v1/query (chemical search by name/formula/InChI)
 *   mychem.annotation    → GET  mychem.info/v1/chem/{id} (single chemical annotation)
 *   mychem.batch_query   → POST mychem.info/v1/query (batch query by name list)
 *   mychem.metadata      → GET  mychem.info/v1/metadata (API build info, source stats)
 *
 * Auth: None (BioThings open access, Scripps Research).
 */
export class MyChemAdapter extends BaseAdapter {
  private static readonly BASE = 'https://mychem.info/v1';
  private static readonly DEFAULT_FIELDS =
    'chebi.name,chebi.definition,chebi.formula,chebi.mass,chembl.pref_name,chembl.max_phase,chembl.molecule_type,chembl.molecule_properties,pubchem.cid,pubchem.molecular_formula,pubchem.molecular_weight,pubchem.xlogp,drugbank.name,drugbank.groups,pharmgkb.name';

  constructor() {
    super({
      provider: 'mychem',
      baseUrl: 'https://mychem.info/v1',
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
      case 'mychem.search':
        return this.buildSearch(params, headers);
      case 'mychem.annotation':
        return this.buildAnnotation(params, headers);
      case 'mychem.batch_query':
        return this.buildBatchQuery(params, headers);
      case 'mychem.metadata':
        return { url: `${MyChemAdapter.BASE}/metadata`, method: 'GET', headers };
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
      : encodeURIComponent(MyChemAdapter.DEFAULT_FIELDS);
    const scopes = params.scopes ? `&scopes=${encodeURIComponent(String(params.scopes))}` : '';
    const url = `${MyChemAdapter.BASE}/query?q=${q}&size=${size}&fields=${fields}${scopes}`;
    return { url, method: 'GET', headers };
  }

  private buildAnnotation(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const chemId = encodeURIComponent(String(params.chem_id));
    const fields = params.fields
      ? encodeURIComponent(String(params.fields))
      : encodeURIComponent(MyChemAdapter.DEFAULT_FIELDS);
    const url = `${MyChemAdapter.BASE}/chem/${chemId}?fields=${fields}`;
    return { url, method: 'GET', headers };
  }

  private buildBatchQuery(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const queries = Array.isArray(params.q) ? params.q : String(params.q).split(',');
    const fields = params.fields ? String(params.fields) : MyChemAdapter.DEFAULT_FIELDS;
    const scopes = params.scopes
      ? String(params.scopes)
      : 'chebi.name,chembl.pref_name,drugbank.name,pubchem.cid';
    const body = JSON.stringify({ q: queries, scopes, fields });
    return {
      url: `${MyChemAdapter.BASE}/query`,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as unknown;
    switch (req.toolId) {
      case 'mychem.search':
        return this.parseQueryResult(body as MyChemQueryResult);
      case 'mychem.annotation':
        return this.parseAnnotation(body as MyChemQueryHit);
      case 'mychem.batch_query':
        return this.parseBatch(body as unknown as MyChemQueryHit[]);
      case 'mychem.metadata':
        return this.parseMetadata(body as unknown as MyChemMetadata);
      default:
        return body;
    }
  }

  private parseQueryResult(data: MyChemQueryResult) {
    return {
      total: data.total ?? 0,
      took_ms: data.took,
      chemicals: (data.hits ?? []).map((h) => this.normalizeHit(h)),
    };
  }

  private parseAnnotation(data: MyChemQueryHit) {
    const raw = data as unknown as Record<string, unknown>;
    if (raw['success'] === false || raw['code'] === 404) {
      return {
        found: false,
        error: raw['error'] ?? 'Chemical not found',
      };
    }
    return { found: true, ...this.normalizeHit(data) };
  }

  private parseBatch(data: unknown) {
    const items = Array.isArray(data) ? data : [];
    return {
      count: items.length,
      chemicals: items.map((v) => {
        const hit = v as MyChemQueryHit & { query?: string; notfound?: boolean };
        if (hit.notfound) {
          return { query: hit.query ?? null, found: false };
        }
        return { query: hit.query ?? null, found: true, ...this.normalizeHit(hit) };
      }),
    };
  }

  private parseMetadata(data: MyChemMetadata) {
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
      total_chemicals: data.stats?.total ?? null,
      source_count: sources.length,
      sources,
    };
  }

  private normalizeHit(h: MyChemQueryHit) {
    const targets =
      h.drugbank?.targets?.slice(0, 5).map((t) => ({
        name: t.name,
        gene: t.gene_name,
        actions: t.actions,
        organism: t.organism,
      })) ?? null;

    const synonyms = h.chebi?.synonyms
      ? Array.isArray(h.chebi.synonyms)
        ? h.chebi.synonyms.slice(0, 10)
        : [h.chebi.synonyms]
      : null;

    return {
      id: h._id,
      score: h._score,
      names: {
        chebi: h.chebi?.name ?? null,
        chembl: h.chembl?.pref_name ?? null,
        drugbank: h.drugbank?.name ?? null,
        pharmgkb: h.pharmgkb?.name ?? null,
        iupac: h.chebi?.iupac ?? null,
        synonyms,
      },
      identifiers: {
        pubchem_cid: h.pubchem?.cid ?? null,
        chembl_id: h.chembl?.molecule_chembl_id ?? null,
        drugbank_id: h.drugbank?.id ?? null,
        pharmgkb_id: h.pharmgkb?.id ?? null,
        inchikey: h._id.includes('-') ? h._id : null,
      },
      structure: {
        molecular_formula: h.pubchem?.molecular_formula ?? h.chebi?.formula ?? null,
        molecular_weight: h.pubchem?.molecular_weight ?? h.chebi?.mass ?? null,
        xlogp: h.pubchem?.xlogp ?? null,
        h_bond_donors: h.pubchem?.h_bond_donor_count ?? h.chembl?.molecule_properties?.hbd ?? null,
        h_bond_acceptors:
          h.pubchem?.h_bond_acceptor_count ?? h.chembl?.molecule_properties?.hba ?? null,
        rotatable_bonds:
          h.pubchem?.rotatable_bond_count ?? h.chembl?.molecule_properties?.rtb ?? null,
        tpsa: h.pubchem?.tpsa ?? h.chembl?.molecule_properties?.psa ?? null,
      },
      drug_info: {
        max_clinical_phase: h.chembl?.max_phase ?? null,
        molecule_type: h.chembl?.molecule_type ?? null,
        approval_year: h.chembl?.first_approval ?? null,
        atc_codes:
          h.chembl?.atc_classifications ?? h.drugbank?.atc_codes?.map((a) => a.code) ?? null,
        drug_groups: h.drugbank?.groups ?? null,
        indication: h.drugbank?.indication ?? null,
        mechanism_of_action: h.drugbank?.mechanism_of_action ?? null,
        black_box_warning: h.chembl?.black_box_warning === 1,
        withdrawn: h.chembl?.withdrawn_flag ?? false,
        pharmacogenomics_annotations: h.pharmgkb?.clinical_annotation_count ?? null,
      },
      targets: targets && targets.length > 0 ? targets : null,
      definition: h.chebi?.definition ?? null,
    };
  }
}
