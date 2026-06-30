import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { UniprotEntry, UniprotTaxonomy } from './types';

const UNIPROT_BASE = 'https://rest.uniprot.org';

/**
 * UniProt REST adapter (UC-553).
 *
 * UniProt is the world's leading protein sequence and annotation database.
 * 250M+ sequences; Swiss-Prot (reviewed) + TrEMBL (unreviewed). CC BY 4.0.
 * No auth, no registration required.
 *
 * Tools:
 *   uniprot.protein_search   → GET /uniprotkb/search
 *   uniprot.protein_entry    → GET /uniprotkb/{accession}
 *   uniprot.protein_features → GET /uniprotkb/{accession}/features
 *   uniprot.taxonomy         → GET /taxonomy/search
 */
export class UniprotAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'uniprot', baseUrl: UNIPROT_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'uniprot.protein_search': {
        const qp = new URLSearchParams();
        const query = String(params.query ?? '');
        const parts: string[] = [query];
        if (params.organism_id) parts.push(`organism_id:${String(params.organism_id)}`);
        if (params.gene) parts.push(`gene:${encodeURIComponent(String(params.gene))}`);
        if (params.reviewed) parts.push('reviewed:true');
        qp.set('query', parts.join(' AND '));
        qp.set('format', 'json');
        qp.set('size', String(Math.min(Number(params.limit) || 5, 25)));
        qp.set(
          'fields',
          'accession,id,protein_name,organism_name,organism_id,gene_names,sequence_length,reviewed,annotation_score',
        );
        return { url: `${UNIPROT_BASE}/uniprotkb/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'uniprot.protein_entry': {
        const accession = encodeURIComponent(
          String(params.accession ?? '')
            .trim()
            .toUpperCase(),
        );
        return {
          url: `${UNIPROT_BASE}/uniprotkb/${accession}?format=json`,
          method: 'GET',
          headers,
        };
      }

      case 'uniprot.protein_features': {
        const accession = encodeURIComponent(
          String(params.accession ?? '')
            .trim()
            .toUpperCase(),
        );
        const url = new URL(`${UNIPROT_BASE}/uniprotkb/${accession}`);
        url.searchParams.set('format', 'json');
        url.searchParams.set(
          'fields',
          'accession,id,protein_name,sequence,ft_act_site,ft_binding,ft_chain,ft_domain,ft_disulfid,ft_mod_res,ft_signal,ft_transit,ft_transmem,ft_variant,ft_helix,ft_strand,ft_turn',
        );
        return { url: url.toString(), method: 'GET', headers };
      }

      case 'uniprot.taxonomy': {
        const qp = new URLSearchParams();
        qp.set('query', String(params.query ?? ''));
        qp.set('format', 'json');
        qp.set('size', String(Math.min(Number(params.limit) || 5, 20)));
        if (params.rank) qp.set('query', `${qp.get('query')} AND rank:${String(params.rank)}`);
        return { url: `${UNIPROT_BASE}/taxonomy/search?${qp.toString()}`, method: 'GET', headers };
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
      case 'uniprot.protein_search':
        return this.parseProteinSearch(body);
      case 'uniprot.protein_entry':
        return this.parseProteinEntry(body as unknown as UniprotEntry);
      case 'uniprot.protein_features':
        return this.parseProteinFeatures(body as unknown as UniprotEntry);
      case 'uniprot.taxonomy':
        return this.parseTaxonomy(body);
      default:
        return body;
    }
  }

  private parseProteinSearch(body: Record<string, unknown>): unknown {
    const results = (body.results ?? []) as Record<string, unknown>[];
    return {
      total: results.length,
      results: results.map((r) => ({
        accession: String(r.primaryAccession ?? ''),
        entry_id: String(r.uniProtkbId ?? ''),
        protein_name: this.extractProteinName(r.proteinDescription as Record<string, unknown>),
        organism: String((r.organism as Record<string, unknown>)?.scientificName ?? ''),
        organism_id: Number((r.organism as Record<string, unknown>)?.taxonId ?? 0),
        gene_names: this.extractGeneNames(r.genes as Array<Record<string, unknown>>),
        sequence_length: Number((r.sequence as Record<string, unknown>)?.length ?? 0),
        reviewed: String(r.entryType ?? '').includes('Swiss-Prot'),
        annotation_score: Number(r.annotationScore ?? 0),
        uniprot_url: `https://www.uniprot.org/uniprotkb/${String(r.primaryAccession ?? '')}`,
      })),
    };
  }

  private parseProteinEntry(entry: UniprotEntry): unknown {
    const recommendedName = entry.proteinDescription?.recommendedName;
    const altNames = (entry.proteinDescription?.alternativeNames ?? [])
      .map((n) => n.fullName?.value)
      .filter(Boolean)
      .slice(0, 5);

    const functions = (entry.comments ?? [])
      .filter((c) => c.commentType === 'FUNCTION')
      .map((c) => c.texts?.[0]?.value ?? '')
      .filter(Boolean)
      .slice(0, 3);

    const subcellular = (entry.comments ?? [])
      .filter((c) => c.commentType === 'SUBCELLULAR LOCATION')
      .flatMap((c) => (c.subcellularLocations ?? []).map((s) => s.location?.value ?? ''))
      .filter(Boolean)
      .slice(0, 5);

    const diseases = (entry.comments ?? [])
      .filter((c) => c.commentType === 'DISEASE' && c.disease)
      .map((c) => ({
        id: c.disease?.diseaseId ?? '',
        name: c.disease?.acronym ?? c.disease?.diseaseId ?? '',
        description: (c.disease?.description ?? '').slice(0, 200),
      }))
      .slice(0, 5);

    const keywords = (entry.keywords ?? []).map((k) => k.name).slice(0, 15);

    const crossRefs = (entry.uniProtKBCrossReferences ?? []).reduce<Record<string, string[]>>(
      (acc, ref) => {
        if (!acc[ref.database]) acc[ref.database] = [];
        acc[ref.database].push(ref.id);
        return acc;
      },
      {},
    );
    const dbs: Record<string, string | string[]> = {};
    for (const db of ['PDB', 'RefSeq', 'Ensembl', 'OMIM', 'PubMed']) {
      if (crossRefs[db]) dbs[db] = crossRefs[db].slice(0, 5);
    }

    return {
      accession: entry.primaryAccession,
      entry_id: entry.uniProtkbId,
      reviewed: entry.entryType?.includes('Swiss-Prot') ?? false,
      annotation_score: entry.annotationScore,
      protein_name: recommendedName?.fullName?.value ?? '',
      ec_numbers: (recommendedName?.ecNumbers ?? []).map((e) => e.value),
      alternative_names: altNames,
      organism: {
        scientific_name: entry.organism?.scientificName ?? '',
        common_name: entry.organism?.commonName ?? null,
        taxon_id: entry.organism?.taxonId ?? 0,
        lineage: (entry.organism?.lineage ?? []).slice(0, 10),
      },
      gene_names: this.extractGeneNames(entry.genes ?? []),
      sequence: {
        length: entry.sequence?.length ?? 0,
        mass_da: entry.sequence?.molWeight ?? 0,
        value: (entry.sequence?.value ?? '').slice(0, 200),
      },
      function: functions,
      subcellular_location: subcellular,
      diseases,
      keywords,
      cross_references: dbs,
      feature_count: (entry.features ?? []).length,
      uniprot_url: `https://www.uniprot.org/uniprotkb/${entry.primaryAccession}`,
    };
  }

  private parseProteinFeatures(entry: UniprotEntry): unknown {
    const features = entry.features ?? [];
    const grouped: Record<string, unknown[]> = {};
    for (const f of features) {
      const type = f.type ?? 'Unknown';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({
        description: f.description ?? null,
        start: f.location?.start?.value ?? null,
        end: f.location?.end?.value ?? null,
        xrefs: (f.featureCrossReferences ?? []).map((x) => `${x.database}:${x.id}`).slice(0, 3),
      });
    }

    return {
      accession: entry.primaryAccession,
      entry_id: entry.uniProtkbId,
      protein_name: this.extractProteinName(
        entry.proteinDescription as unknown as Record<string, unknown>,
      ),
      sequence_length: entry.sequence?.length ?? 0,
      feature_count: features.length,
      feature_types: Object.keys(grouped).sort(),
      features: grouped,
      uniprot_url: `https://www.uniprot.org/uniprotkb/${entry.primaryAccession}`,
    };
  }

  private parseTaxonomy(body: Record<string, unknown>): unknown {
    const results = (body.results ?? []) as UniprotTaxonomy[];
    return {
      total: results.length,
      results: results.map((t) => ({
        taxon_id: t.taxonId,
        scientific_name: t.scientificName,
        common_name: t.commonName ?? null,
        rank: t.rank ?? null,
        lineage: (t.lineage ?? []).slice(0, 8),
        reviewed_proteins: t.statistics?.reviewedProteinCount ?? 0,
        unreviewed_proteins: t.statistics?.unreviewedProteinCount ?? 0,
        uniprot_url: `https://www.uniprot.org/taxonomy/${t.taxonId}`,
      })),
    };
  }

  private extractProteinName(desc: Record<string, unknown> | undefined): string {
    if (!desc) return '';
    const rec = desc.recommendedName as Record<string, unknown> | undefined;
    return String((rec?.fullName as Record<string, unknown>)?.value ?? '');
  }

  private extractGeneNames(genes: Array<{ geneName?: { value: string } }> | undefined): string[] {
    if (!genes) return [];
    return genes.map((g) => String(g.geneName?.value ?? '')).filter(Boolean);
  }
}
