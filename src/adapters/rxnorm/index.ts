import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  RxNormDrugsResponse,
  RxNormPropertiesResponse,
  RxNormNdcStatusResponse,
  RxNormDrugClassResponse,
  RxNormDrugSearchOutput,
  RxNormPropertiesOutput,
  RxNormNdcOutput,
  RxNormDrugClassOutput,
} from './types';

const BASE = 'https://rxnav.nlm.nih.gov/REST';

/** Human-readable labels for RxNorm term types (TTY). */
const TTY_LABELS: Record<string, string> = {
  IN: 'Ingredient',
  PIN: 'Precise Ingredient',
  MIN: 'Multiple Ingredients',
  SCDC: 'Semantic Clinical Drug Component',
  SCDF: 'Semantic Clinical Drug Form',
  SCDG: 'Semantic Clinical Drug Group',
  SCD: 'Semantic Clinical Drug',
  SBD: 'Semantic Branded Drug',
  SBDC: 'Semantic Branded Drug Component',
  SBDF: 'Semantic Branded Drug Form',
  SBDG: 'Semantic Branded Drug Group',
  BN: 'Brand Name',
  BPCK: 'Branded Pack',
  GPCK: 'Generic Pack',
  PSN: 'Prescribable Name',
  SY: 'Synonym',
  TMSY: 'Tall Man Synonym',
  DF: 'Dose Form',
  DFG: 'Dose Form Group',
  ET: 'Entry Term',
};

/**
 * RxNorm adapter (UC-478).
 *
 * NIH National Library of Medicine RxNav REST API.
 * Provides standardized drug nomenclature used across US healthcare systems.
 * No auth required. No rate limits documented.
 *
 * Tools:
 *   rxnorm.drug_search       → GET /REST/drugs.json?name={name}
 *   rxnorm.rxcui_properties  → GET /REST/rxcui/{rxcui}/properties.json
 *   rxnorm.ndc_lookup        → GET /REST/ndcstatus.json?ndc={ndc}
 *   rxnorm.drug_class        → GET /REST/rxclass/class/byRxcui.json?rxcui={rxcui}
 */
export class RxNormAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'rxnorm', baseUrl: BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'rxnorm.drug_search': {
        const qp = new URLSearchParams();
        qp.set('name', String(params.name ?? ''));
        return { url: `${BASE}/drugs.json?${qp.toString()}`, method: 'GET', headers };
      }

      case 'rxnorm.rxcui_properties': {
        const rxcui = encodeURIComponent(String(params.rxcui ?? ''));
        return { url: `${BASE}/rxcui/${rxcui}/properties.json`, method: 'GET', headers };
      }

      case 'rxnorm.ndc_lookup': {
        const qp = new URLSearchParams();
        qp.set('ndc', String(params.ndc ?? ''));
        return { url: `${BASE}/ndcstatus.json?${qp.toString()}`, method: 'GET', headers };
      }

      case 'rxnorm.drug_class': {
        const qp = new URLSearchParams();
        qp.set('rxcui', String(params.rxcui ?? ''));
        if (params.class_types) qp.set('classTypes', String(params.class_types));
        return {
          url: `${BASE}/rxclass/class/byRxcui.json?${qp.toString()}`,
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
    const body = raw.body as Record<string, unknown>;
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'rxnorm.drug_search':
        return this.parseDrugSearch(body as unknown as RxNormDrugsResponse, params);
      case 'rxnorm.rxcui_properties':
        return this.parseProperties(body as unknown as RxNormPropertiesResponse);
      case 'rxnorm.ndc_lookup':
        return this.parseNdcStatus(body as unknown as RxNormNdcStatusResponse);
      case 'rxnorm.drug_class':
        return this.parseDrugClass(body as unknown as RxNormDrugClassResponse, params);
      default:
        return body;
    }
  }

  private parseDrugSearch(
    body: RxNormDrugsResponse,
    params: Record<string, unknown>,
  ): RxNormDrugSearchOutput {
    const groups = body?.drugGroup?.conceptGroup ?? [];
    const ttyFilter = params.tty ? String(params.tty).toUpperCase() : null;
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);

    const drugs = groups
      .filter((g) => !ttyFilter || g.tty === ttyFilter)
      .flatMap((g) =>
        (g.conceptProperties ?? []).map((p) => ({
          rxcui: p.rxcui,
          name: p.name,
          synonym: p.synonym || '',
          tty: g.tty,
          tty_label: TTY_LABELS[g.tty] ?? g.tty,
        })),
      )
      .slice(0, limit);

    return {
      query: String(params.name ?? ''),
      total: drugs.length,
      drugs,
    };
  }

  private parseProperties(body: RxNormPropertiesResponse): RxNormPropertiesOutput {
    const p = body?.properties;
    if (!p?.rxcui) {
      return {
        rxcui: '',
        name: '',
        synonym: '',
        tty: '',
        tty_label: '',
        language: '',
        suppressed: false,
      };
    }
    return {
      rxcui: p.rxcui,
      name: p.name,
      synonym: p.synonym || '',
      tty: p.tty,
      tty_label: TTY_LABELS[p.tty] ?? p.tty,
      language: p.language,
      suppressed: p.suppress !== 'N',
    };
  }

  private parseNdcStatus(body: RxNormNdcStatusResponse): RxNormNdcOutput {
    const s = body?.ndcStatus;
    if (!s?.ndc11) {
      return {
        ndc11: '',
        status: 'NOT_FOUND',
        active: false,
        rxcui: '',
        concept_name: '',
        concept_status: '',
        sources: [],
      };
    }
    return {
      ndc11: s.ndc11,
      status: s.status,
      active: s.active === 'YES',
      rxcui: s.rxcui,
      concept_name: s.conceptName,
      concept_status: s.conceptStatus,
      sources: s.sourceList?.sourceName ?? [],
    };
  }

  private parseDrugClass(
    body: RxNormDrugClassResponse,
    params: Record<string, unknown>,
  ): RxNormDrugClassOutput {
    const entries = body?.rxclassDrugInfoList?.rxclassDrugInfo ?? [];
    const sourceFilter = params.source ? String(params.source).toUpperCase() : null;

    const seen = new Set<string>();
    const classes = entries
      .filter((e) => !sourceFilter || e.relaSource.toUpperCase() === sourceFilter)
      .reduce<RxNormDrugClassOutput['classes']>((acc, e) => {
        const key = `${e.rxclassMinConceptItem.classId}:${e.relaSource}`;
        if (!seen.has(key)) {
          seen.add(key);
          acc.push({
            class_id: e.rxclassMinConceptItem.classId,
            class_name: e.rxclassMinConceptItem.className,
            class_type: e.rxclassMinConceptItem.classType,
            relationship: e.rela || 'member_of',
            source: e.relaSource,
          });
        }
        return acc;
      }, []);

    return {
      rxcui: String(params.rxcui ?? ''),
      classes,
    };
  }
}
