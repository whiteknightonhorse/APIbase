import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MaterialsSummary,
  MaterialsElasticity,
  MaterialsApiResponse,
  MaterialsSearchResult,
  MaterialsDetailsResult,
  MaterialsElasticityResult,
} from './types';

/**
 * Materials Project adapter (UC-222).
 *
 * Supported tools:
 *   materials.search     → GET /materials/summary/ (search by formula/elements/properties)
 *   materials.details    → GET /materials/summary/ (full properties by material_id)
 *   materials.elasticity → GET /materials/elasticity/ (mechanical properties)
 *
 * Auth: X-API-KEY header. Free, unlimited, CC BY 4.0.
 * Rate limits: 25/sec, 1K/min, 40K/hr.
 */
export class MaterialsProjectAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'materials-project',
      baseUrl: 'https://api.materialsproject.org/materials',
    });
    this.apiKey = apiKey;
  }

  private static readonly SEARCH_FIELDS = [
    'material_id', 'formula_pretty', 'band_gap', 'formation_energy_per_atom',
    'energy_above_hull', 'is_stable', 'density', 'is_metal', 'is_magnetic',
    'elements', 'symmetry',
  ].join(',');

  private static readonly DETAILS_FIELDS = [
    'material_id', 'formula_pretty', 'elements', 'nelements', 'nsites',
    'volume', 'density', 'band_gap', 'is_gap_direct', 'cbm', 'vbm', 'efermi',
    'is_metal', 'formation_energy_per_atom', 'energy_above_hull', 'is_stable',
    'is_magnetic', 'total_magnetization', 'ordering',
    'bulk_modulus', 'shear_modulus', 'homogeneous_poisson',
    'symmetry', 'theoretical', 'database_IDs',
  ].join(',');

  private static readonly ELASTICITY_FIELDS = [
    'material_id', 'bulk_modulus', 'shear_modulus',
    'universal_anisotropy', 'homogeneous_poisson', 'elastic_tensor',
  ].join(',');

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      'X-API-KEY': this.apiKey,
      'accept': 'application/json',
    };

    switch (req.toolId) {
      case 'materials.search': {
        const qp = new URLSearchParams();
        qp.set('_fields', MaterialsProjectAdapter.SEARCH_FIELDS);
        qp.set('_limit', String(Math.min(Number(params.limit) || 10, 50)));
        if (params.skip) qp.set('_skip', String(params.skip));
        if (params.formula) qp.set('formula', String(params.formula));
        if (params.elements) qp.set('elements', String(params.elements));
        if (params.band_gap_min != null) qp.set('band_gap_min', String(params.band_gap_min));
        if (params.band_gap_max != null) qp.set('band_gap_max', String(params.band_gap_max));
        if (params.is_stable != null) qp.set('is_stable', String(params.is_stable));
        if (params.is_metal != null) qp.set('is_metal', String(params.is_metal));
        return {
          url: `${this.baseUrl}/summary/?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'materials.details': {
        const qp = new URLSearchParams();
        qp.set('_fields', MaterialsProjectAdapter.DETAILS_FIELDS);
        qp.set('material_ids', String(params.material_id));
        return {
          url: `${this.baseUrl}/summary/?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'materials.elasticity': {
        const qp = new URLSearchParams();
        qp.set('_fields', MaterialsProjectAdapter.ELASTICITY_FIELDS);
        qp.set('material_ids', String(params.material_id));
        return {
          url: `${this.baseUrl}/elasticity/?${qp.toString()}`,
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
    const body = raw.body as MaterialsApiResponse<Record<string, unknown>>;

    if (!body.data) {
      return { error: true, message: body };
    }

    switch (req.toolId) {
      case 'materials.search':
        return this.parseSearch(body as unknown as MaterialsApiResponse<MaterialsSummary>);
      case 'materials.details':
        return this.parseDetails(body as unknown as MaterialsApiResponse<MaterialsSummary>);
      case 'materials.elasticity':
        return this.parseElasticity(body as unknown as MaterialsApiResponse<MaterialsElasticity>);
      default:
        return body;
    }
  }

  private parseSearch(body: MaterialsApiResponse<MaterialsSummary>): MaterialsSearchResult {
    return {
      materials: body.data.map((m) => ({
        material_id: m.material_id,
        formula: m.formula_pretty,
        band_gap_ev: m.band_gap,
        formation_energy_ev: m.formation_energy_per_atom,
        energy_above_hull_ev: m.energy_above_hull,
        is_stable: m.is_stable,
        density_g_cm3: m.density,
        crystal_system: m.symmetry?.crystal_system ?? null,
        spacegroup: m.symmetry?.symbol ?? null,
        is_metal: m.is_metal,
        is_magnetic: m.is_magnetic,
        elements: m.elements ?? [],
      })),
      total: body.meta.total_doc,
    };
  }

  private parseDetails(body: MaterialsApiResponse<MaterialsSummary>): MaterialsDetailsResult | { error: string } {
    if (body.data.length === 0) {
      return { error: 'Material not found' };
    }

    const m = body.data[0];
    return {
      material_id: m.material_id,
      formula: m.formula_pretty,
      elements: m.elements ?? [],
      crystal_system: m.symmetry?.crystal_system ?? null,
      spacegroup: m.symmetry?.symbol ?? null,
      spacegroup_number: m.symmetry?.number ?? null,
      nsites: m.nsites,
      volume_ang3: m.volume,
      density_g_cm3: m.density,
      band_gap_ev: m.band_gap,
      is_gap_direct: m.is_gap_direct,
      cbm_ev: m.cbm,
      vbm_ev: m.vbm,
      fermi_energy_ev: m.efermi,
      is_metal: m.is_metal,
      formation_energy_ev: m.formation_energy_per_atom,
      energy_above_hull_ev: m.energy_above_hull,
      is_stable: m.is_stable,
      is_magnetic: m.is_magnetic,
      total_magnetization: m.total_magnetization,
      magnetic_ordering: m.ordering,
      bulk_modulus_gpa: m.bulk_modulus?.vrh ?? null,
      shear_modulus_gpa: m.shear_modulus?.vrh ?? null,
      poisson_ratio: m.homogeneous_poisson,
      theoretical: m.theoretical,
      database_ids: m.database_IDs,
    };
  }

  private parseElasticity(body: MaterialsApiResponse<MaterialsElasticity>): MaterialsElasticityResult | { error: string } {
    if (body.data.length === 0) {
      return { error: 'No elasticity data found for this material' };
    }

    const e = body.data[0];
    return {
      material_id: e.material_id,
      bulk_modulus: e.bulk_modulus,
      shear_modulus: e.shear_modulus,
      universal_anisotropy: e.universal_anisotropy,
      poisson_ratio: e.homogeneous_poisson,
      elastic_tensor_ieee: e.elastic_tensor?.ieee_format ?? null,
    };
  }
}
