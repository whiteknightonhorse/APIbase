import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  PharmGkbGeneResult,
  PharmGkbDrugResult,
  PharmGkbVariantResult,
  PharmGkbDrugLabelResult,
} from './types';

const PHARMGKB_BASE = 'https://api.pharmgkb.org/v1';

export class PharmGkbAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'pharmgkb', baseUrl: PHARMGKB_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'pharmgkb.gene_search': {
        const qp = new URLSearchParams();
        qp.set('symbol', encodeURIComponent(String(params.symbol)));
        qp.set('view', 'max');
        return { url: `${PHARMGKB_BASE}/data/gene?${qp.toString()}`, method: 'GET', headers };
      }

      case 'pharmgkb.drug_search': {
        const qp = new URLSearchParams();
        qp.set('name', encodeURIComponent(String(params.name)));
        qp.set('view', 'max');
        return { url: `${PHARMGKB_BASE}/data/chemical?${qp.toString()}`, method: 'GET', headers };
      }

      case 'pharmgkb.variant_lookup': {
        const qp = new URLSearchParams();
        qp.set('symbol', encodeURIComponent(String(params.rsid)));
        qp.set('view', 'max');
        return { url: `${PHARMGKB_BASE}/data/variant?${qp.toString()}`, method: 'GET', headers };
      }

      case 'pharmgkb.drug_labels': {
        const qp = new URLSearchParams();
        qp.set('source', String(params.source || 'FDA'));
        qp.set('view', 'base');
        if (params.dosing_only) qp.set('dosingInformation', 'true');
        if (params.page && Number(params.page) > 1) qp.set('page', String(Number(params.page)));
        return { url: `${PHARMGKB_BASE}/data/drugLabel?${qp.toString()}`, method: 'GET', headers };
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

    // PharmGKB wraps errors in { status: 'fail', data: { errors: [...] } }
    if (body.status === 'fail') {
      const errors = (body.data as Record<string, unknown>)?.errors as
        | Array<{ message: string }>
        | undefined;
      const msg = errors?.[0]?.message ?? 'PharmGKB error';
      throw {
        code: ProviderErrorCode.INPUT_REJECTED,
        httpStatus: 422,
        message: msg,
        provider: this.provider,
        toolId: req.toolId,
        durationMs: 0,
      };
    }

    switch (req.toolId) {
      case 'pharmgkb.gene_search':
        return this.parseGeneSearch(body);
      case 'pharmgkb.drug_search':
        return this.parseDrugSearch(body);
      case 'pharmgkb.variant_lookup':
        return this.parseVariantLookup(body);
      case 'pharmgkb.drug_labels':
        return this.parseDrugLabels(body);
      default:
        return body;
    }
  }

  private parseGeneSearch(body: Record<string, unknown>): { results: PharmGkbGeneResult[] } {
    const raw = body.data as Record<string, unknown>[];
    if (!Array.isArray(raw)) {
      const single = body.data as Record<string, unknown>;
      return { results: single ? [this.toGeneResult(single)] : [] };
    }
    return { results: raw.map((g) => this.toGeneResult(g)) };
  }

  private toGeneResult(g: Record<string, unknown>): PharmGkbGeneResult {
    const altNames = g.altNames as Record<string, string[]> | undefined;
    const chr = g.chr as Record<string, unknown> | undefined;
    const vipSummary = g.vipSummary as Record<string, unknown> | undefined;
    // Strip HTML tags from VIP summary
    const summaryHtml = vipSummary?.html as string | undefined;
    const summaryText = summaryHtml ? summaryHtml.replace(/<[^>]*>/g, '').trim() : null;
    return {
      id: String(g.id ?? ''),
      symbol: String(g.symbol ?? ''),
      name: String(g.name ?? ''),
      chromosome: chr ? String(chr.name ?? '') : null,
      chr_start_b38: g.chrStartPosB38 != null ? Number(g.chrStartPosB38) : null,
      chr_stop_b38: g.chrStopPosB38 != null ? Number(g.chrStopPosB38) : null,
      strand: g.strand != null ? String(g.strand) : null,
      cpic_gene: Boolean(g.cpicGene),
      amp: Boolean(g.amp),
      allele_type: g.alleleType != null ? String(g.alleleType) : null,
      vip_tier: g.vipTier != null ? String(g.vipTier) : null,
      vip_summary: summaryText,
      alt_symbols: altNames?.symbol ?? [],
    };
  }

  private parseDrugSearch(body: Record<string, unknown>): { results: PharmGkbDrugResult[] } {
    const raw = body.data as Record<string, unknown>[];
    if (!Array.isArray(raw)) {
      const single = body.data as Record<string, unknown>;
      return { results: single ? [this.toDrugResult(single)] : [] };
    }
    return { results: raw.map((d) => this.toDrugResult(d)) };
  }

  private toDrugResult(d: Record<string, unknown>): PharmGkbDrugResult {
    const altNames = d.altNames as Record<string, string[]> | undefined;
    const linkOuts = (d.linkOuts ?? []) as Array<Record<string, string>>;
    const atcEntry = linkOuts.find((l) => l.resource === 'ATC');
    const chebiEntry = linkOuts.find((l) => l.resource === 'ChEBI');
    const drugbankEntry = linkOuts.find((l) => l.resource === 'DrugBank');
    return {
      id: String(d.id ?? ''),
      name: String(d.name ?? ''),
      types: (d.types as string[] | undefined) ?? [],
      smiles: d.smiles != null ? String(d.smiles) : null,
      inchi: d.inChi != null ? String(d.inChi) : null,
      trade_names: altNames?.trade ?? [],
      generic_names: altNames?.generic ?? [],
      atc_code: atcEntry ? String(atcEntry.resourceId) : null,
      chebi_id: chebiEntry ? String(chebiEntry.resourceId) : null,
      drugbank_id: drugbankEntry ? String(drugbankEntry.resourceId) : null,
      pediatric: Boolean(d.pediatric),
    };
  }

  private parseVariantLookup(body: Record<string, unknown>): { results: PharmGkbVariantResult[] } {
    const raw = body.data as Record<string, unknown>[];
    if (!Array.isArray(raw)) {
      const single = body.data as Record<string, unknown>;
      return { results: single ? [this.toVariantResult(single)] : [] };
    }
    return { results: raw.map((v) => this.toVariantResult(v)) };
  }

  private toVariantResult(v: Record<string, unknown>): PharmGkbVariantResult {
    const crossRefs = (v.crossReferences ?? []) as Array<Record<string, string>>;
    const clinvarIds = crossRefs.filter((r) => r.resource === 'ClinVar').map((r) => r.resourceId);

    // Extract primary location gene names and chromosome from locations array
    const locations = (v.locations ?? []) as Array<Record<string, unknown>>;
    const primaryLoc = locations.find((l) => l.assembly === 'GRCh38') ?? locations[0];
    const seqName = primaryLoc
      ? ((primaryLoc.sequence as Record<string, unknown>)?.name as string | undefined)
      : undefined;
    const chromosome = seqName ? seqName.replace('[GRCh38]', '') : null;
    const position = primaryLoc?.begin != null ? Number(primaryLoc.begin) : null;

    // Collect gene names from haplotype/locations
    const geneSet = new Set<string>();
    for (const loc of locations) {
      const genes = (loc.genes ?? []) as Array<Record<string, unknown>>;
      for (const g of genes) if (g.symbol) geneSet.add(String(g.symbol));
    }

    return {
      id: String(v.id ?? ''),
      symbol: String(v.symbol ?? ''),
      name: String(v.name ?? ''),
      change_classification: v.changeClassification != null ? String(v.changeClassification) : null,
      clinical_significance: v.clinicalSignificance != null ? String(v.clinicalSignificance) : null,
      variant_type: v.type != null ? String(v.type) : null,
      rare: Boolean(v.rare),
      rarity_source: v.raritySource != null ? String(v.raritySource) : null,
      chromosome,
      position_b38: position,
      genes: Array.from(geneSet),
      clinvar_ids: clinvarIds,
    };
  }

  private parseDrugLabels(body: Record<string, unknown>): {
    count: number;
    results: PharmGkbDrugLabelResult[];
  } {
    const raw = (body.data ?? []) as Array<Record<string, unknown>>;
    const results = raw.map((l) => {
      const history = (l.history ?? []) as Array<Record<string, unknown>>;
      const lastUpdate = history.length > 0 ? String(history[history.length - 1].date ?? '') : null;
      return {
        id: String(l.id ?? ''),
        name: String(l.name ?? ''),
        source: String(l.source ?? ''),
        dosing_information: Boolean(l.dosingInformation),
        alternate_drug_available: Boolean(l.alternateDrugAvailable),
        cancer_genome: Boolean(l.cancerGenome),
        biomarker_status: l.biomarkerStatus != null ? String(l.biomarkerStatus) : null,
        pediatric: Boolean(l.pediatric),
        has_testing_info: Boolean(l.hasTestingInfo),
        updated: lastUpdate,
      } as PharmGkbDrugLabelResult;
    });
    return { count: results.length, results };
  }
}
