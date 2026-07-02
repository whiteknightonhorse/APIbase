import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  ChemblMoleculeListRaw,
  ChemblMoleculeRaw,
  ChemblTargetListRaw,
  ChemblActivityListRaw,
  MoleculeItem,
  MoleculeSearchOutput,
  MoleculeDetailOutput,
  TargetItem,
  TargetSearchOutput,
  BioactivityOutput,
} from './types';

const CHEMBL_BASE = 'https://www.ebi.ac.uk/chembl/api/data';

function normalizeMolecule(m: ChemblMoleculeRaw): MoleculeItem {
  const props = m.molecule_properties;
  const structs = m.molecule_structures;
  return {
    chembl_id: m.molecule_chembl_id,
    name: m.pref_name ?? null,
    max_phase: m.max_phase ?? null,
    molecule_type: m.molecule_type ?? null,
    first_approval: m.first_approval ?? null,
    molecular_formula: props?.full_molformula ?? null,
    molecular_weight: props?.full_mwt != null ? parseFloat(props.full_mwt) : null,
    alogp: props?.alogp != null ? parseFloat(props.alogp) : null,
    hbd: props?.hbd ?? null,
    hba: props?.hba ?? null,
    psa: props?.psa != null ? parseFloat(props.psa) : null,
    ro5_violations: props?.num_ro5_violations ?? null,
    smiles: structs?.canonical_smiles ?? null,
    inchi_key: structs?.standard_inchi_key ?? null,
    oral: m.oral ?? false,
    withdrawn: m.withdrawn_flag ?? false,
    atc_codes: m.atc_classifications ?? [],
  };
}

/**
 * ChEMBL adapter (UC-579).
 *
 * Drug discovery database maintained by EMBL-EBI. 2.9M+ molecules,
 * 18K+ targets, 20M+ bioactivity measurements. CC BY-SA 3.0 license,
 * no auth required, no documented rate limits.
 *
 * Tools: molecule_search, molecule_detail, target_search, bioactivity
 */
export class ChemblAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'chembl', baseUrl: CHEMBL_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const p = req.params as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'chembl.molecule_search': {
        const params = new URLSearchParams({
          format: 'json',
          limit: String(Math.min(Number(p.limit) || 10, 25)),
        });
        if (p.query)
          params.set(
            'pref_name__icontains',
            encodeURIComponent(String(p.query)).replace(/%20/g, '+'),
          );
        if (p.molecule_type) params.set('molecule_type', String(p.molecule_type));
        if (p.max_phase != null) params.set('max_phase', String(p.max_phase));
        if (p.max_phase_gte != null) params.set('max_phase__gte', String(p.max_phase_gte));
        return { url: `${CHEMBL_BASE}/molecule?${params}`, method: 'GET', headers };
      }

      case 'chembl.molecule_detail': {
        const chemblId = String(p.chembl_id ?? '')
          .toUpperCase()
          .trim();
        if (!chemblId) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'chembl_id is required (e.g. CHEMBL25)',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `${CHEMBL_BASE}/molecule/${encodeURIComponent(chemblId)}?format=json`,
          method: 'GET',
          headers,
        };
      }

      case 'chembl.target_search': {
        const params = new URLSearchParams({
          format: 'json',
          limit: String(Math.min(Number(p.limit) || 10, 25)),
        });
        if (p.query)
          params.set(
            'pref_name__icontains',
            encodeURIComponent(String(p.query)).replace(/%20/g, '+'),
          );
        if (p.target_type) params.set('target_type', String(p.target_type));
        if (p.organism)
          params.set(
            'organism__icontains',
            encodeURIComponent(String(p.organism)).replace(/%20/g, '+'),
          );
        return { url: `${CHEMBL_BASE}/target?${params}`, method: 'GET', headers };
      }

      case 'chembl.bioactivity': {
        const molId = p.molecule_chembl_id
          ? String(p.molecule_chembl_id).toUpperCase().trim()
          : null;
        const targetId = p.target_chembl_id
          ? String(p.target_chembl_id).toUpperCase().trim()
          : null;
        if (!molId && !targetId) {
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: 'Provide at least one of: molecule_chembl_id or target_chembl_id',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        const params = new URLSearchParams({
          format: 'json',
          limit: String(Math.min(Number(p.limit) || 10, 25)),
        });
        if (molId) params.set('molecule_chembl_id', molId);
        if (targetId) params.set('target_chembl_id', targetId);
        if (p.activity_type) params.set('standard_type', String(p.activity_type));
        return { url: `${CHEMBL_BASE}/activity?${params}`, method: 'GET', headers };
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
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'chembl.molecule_search': {
        const data = body as unknown as ChemblMoleculeListRaw;
        const molecules = (data.molecules ?? []).map(normalizeMolecule);
        const output: MoleculeSearchOutput = {
          total: data.page_meta?.total_count ?? molecules.length,
          returned: molecules.length,
          molecules,
        };
        return output;
      }

      case 'chembl.molecule_detail': {
        const m = body as unknown as ChemblMoleculeRaw;
        const base = normalizeMolecule(m);
        const props = m.molecule_properties;
        const structs = m.molecule_structures;
        const output: MoleculeDetailOutput = {
          ...base,
          inchi: structs?.standard_inchi ?? null,
          qed: props?.qed_weighted != null ? parseFloat(props.qed_weighted) : null,
          natural_product: m.natural_product === 1,
          black_box_warning: m.black_box_warning === 1,
        };
        return output;
      }

      case 'chembl.target_search': {
        const data = body as unknown as ChemblTargetListRaw;
        const targets: TargetItem[] = (data.targets ?? []).map((t) => {
          const geneNames: string[] = [];
          const accessions: string[] = [];
          for (const comp of t.target_components ?? []) {
            if (comp.accession) accessions.push(comp.accession);
            for (const syn of comp.target_component_synonyms ?? []) {
              if (syn.syn_type === 'GENE_SYMBOL') geneNames.push(syn.component_synonym);
            }
          }
          return {
            chembl_id: t.target_chembl_id,
            name: t.pref_name,
            target_type: t.target_type,
            organism: t.organism ?? null,
            component_count: (t.target_components ?? []).length,
            gene_names: [...new Set(geneNames)],
            accessions: [...new Set(accessions)],
          };
        });
        const output: TargetSearchOutput = {
          total: data.page_meta?.total_count ?? targets.length,
          returned: targets.length,
          targets,
        };
        return output;
      }

      case 'chembl.bioactivity': {
        const data = body as unknown as ChemblActivityListRaw;
        const activities = (data.activities ?? []).map((a) => ({
          activity_id: a.activity_id,
          molecule_chembl_id: a.molecule_chembl_id,
          target_chembl_id: a.target_chembl_id ?? null,
          assay_chembl_id: a.assay_chembl_id,
          activity_type: a.standard_type ?? null,
          value: a.standard_value != null ? parseFloat(a.standard_value) : null,
          units: a.standard_units ?? null,
          relation: a.standard_relation ?? null,
          pchembl_value: a.pchembl_value != null ? parseFloat(a.pchembl_value) : null,
          activity_comment: a.activity_comment ?? null,
          assay_description: a.assay_description ?? null,
          document_chembl_id: a.document_chembl_id ?? null,
        }));
        const output: BioactivityOutput = {
          total: data.page_meta?.total_count ?? activities.length,
          returned: activities.length,
          activities,
        };
        return output;
      }

      default:
        return body;
    }
  }
}
