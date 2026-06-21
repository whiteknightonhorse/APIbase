import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MyGeneQueryResult, MyGeneGeneDetail, MyGeneQueryHit } from './types';

/**
 * MyGene.info adapter (UC-479).
 *
 * Supported tools:
 *   mygene.search          → GET  mygene.info/v3/query (full-text gene search)
 *   mygene.gene_info       → GET  mygene.info/v3/gene/{id} (gene details by NCBI/Ensembl ID)
 *   mygene.batch_genes     → POST mygene.info/v3/gene (batch gene fetch by ID list)
 *   mygene.query_by_symbol → GET  mygene.info/v3/query?q=symbol:{sym} (exact symbol lookup)
 *
 * Auth: None (BioThings CC0 open data, unlimited free).
 */
export class MyGeneAdapter extends BaseAdapter {
  private static readonly BASE = 'https://mygene.info/v3';
  private static readonly DEFAULT_FIELDS = 'symbol,name,taxid,entrezgene,type_of_gene,summary';
  private static readonly DETAIL_FIELDS =
    'symbol,name,taxid,entrezgene,type_of_gene,summary,ensembl,uniprot,alias,genomic_pos,pathway';

  constructor() {
    super({
      provider: 'mygene',
      baseUrl: 'https://mygene.info/v3',
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
      case 'mygene.search':
        return this.buildSearch(params, headers);
      case 'mygene.gene_info':
        return this.buildGeneInfo(params, headers);
      case 'mygene.batch_genes':
        return this.buildBatchGenes(params, headers);
      case 'mygene.query_by_symbol':
        return this.buildQueryBySymbol(params, headers);
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
    const species = params.species ? encodeURIComponent(String(params.species)) : 'human';
    const size = params.size ? Number(params.size) : 10;
    const fields = params.fields
      ? encodeURIComponent(String(params.fields))
      : MyGeneAdapter.DEFAULT_FIELDS;
    const url = `${MyGeneAdapter.BASE}/query?q=${q}&species=${species}&size=${size}&fields=${fields}`;
    return { url, method: 'GET', headers };
  }

  private buildGeneInfo(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const geneId = encodeURIComponent(String(params.gene_id));
    const fields = params.fields
      ? encodeURIComponent(String(params.fields))
      : MyGeneAdapter.DETAIL_FIELDS;
    const url = `${MyGeneAdapter.BASE}/gene/${geneId}?fields=${fields}`;
    return { url, method: 'GET', headers };
  }

  private buildBatchGenes(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string>; body: string } {
    const ids = String(params.ids);
    const fields = params.fields ? String(params.fields) : MyGeneAdapter.DETAIL_FIELDS;
    const body = new URLSearchParams({ ids, fields }).toString();
    return {
      url: `${MyGeneAdapter.BASE}/gene`,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    };
  }

  private buildQueryBySymbol(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const symbol = encodeURIComponent(`symbol:${String(params.symbol)}`);
    const species = params.species ? encodeURIComponent(String(params.species)) : 'human';
    const fields = params.fields
      ? encodeURIComponent(String(params.fields))
      : MyGeneAdapter.DETAIL_FIELDS;
    const url = `${MyGeneAdapter.BASE}/query?q=${symbol}&species=${species}&size=1&fields=${fields}`;
    return { url, method: 'GET', headers };
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    const body = raw.body as Record<string, unknown>;

    switch (req.toolId) {
      case 'mygene.search':
        return this.parseQueryResult(body as unknown as MyGeneQueryResult, false);
      case 'mygene.query_by_symbol':
        return this.parseQueryResult(body as unknown as MyGeneQueryResult, true);
      case 'mygene.gene_info':
        return this.parseGeneInfo(body as unknown as MyGeneGeneDetail);
      case 'mygene.batch_genes':
        return this.parseBatchGenes(body as unknown as MyGeneGeneDetail[]);
      default:
        return body;
    }
  }

  private parseQueryResult(data: MyGeneQueryResult, singleResult: boolean) {
    const genes = (data.hits ?? []).map((h) => this.normalizeHit(h));
    if (singleResult) {
      return { gene: genes[0] ?? null, found: genes.length > 0, took_ms: data.took };
    }
    return { total: data.total ?? 0, took_ms: data.took, genes };
  }

  private parseGeneInfo(data: MyGeneGeneDetail) {
    return {
      id: data._id,
      symbol: data.symbol,
      name: data.name,
      type_of_gene: data.type_of_gene,
      taxid: data.taxid,
      entrezgene: data.entrezgene,
      summary: data.summary,
      aliases: typeof data.alias === 'string' ? [data.alias] : (data.alias ?? []),
      ensembl_gene: data.ensembl?.gene,
      uniprot_swissprot: data.uniprot?.['Swiss-Prot'],
      genomic_position: data.genomic_pos
        ? {
            chromosome: data.genomic_pos.chr,
            start: data.genomic_pos.start,
            end: data.genomic_pos.end,
            strand: data.genomic_pos.strand,
          }
        : null,
      pathways: data.pathway
        ? {
            kegg: (data.pathway.kegg ?? []).map((k) => ({ id: k.id, name: k.name })),
            reactome: (data.pathway.reactome ?? []).map((r) => ({ id: r.id, name: r.name })),
            wikipathways: (data.pathway.wikipathways ?? []).map((w) => ({
              id: w.id,
              name: w.name,
            })),
          }
        : null,
      go: data.go
        ? {
            biological_process: (data.go.BP ?? [])
              .slice(0, 20)
              .map((g) => ({ id: g.id, term: g.term })),
            cellular_component: (data.go.CC ?? [])
              .slice(0, 20)
              .map((g) => ({ id: g.id, term: g.term })),
            molecular_function: (data.go.MF ?? [])
              .slice(0, 20)
              .map((g) => ({ id: g.id, term: g.term })),
          }
        : null,
    };
  }

  private parseBatchGenes(data: MyGeneGeneDetail[]) {
    const genes = Array.isArray(data) ? data : [];
    return {
      count: genes.length,
      genes: genes.map((g) => ({
        id: g._id,
        symbol: g.symbol,
        name: g.name,
        type_of_gene: g.type_of_gene,
        taxid: g.taxid,
        entrezgene: g.entrezgene,
        summary: g.summary,
        ensembl_gene: g.ensembl?.gene,
      })),
    };
  }

  private normalizeHit(h: MyGeneQueryHit) {
    return {
      id: h._id,
      score: h._score,
      symbol: h.symbol,
      name: h.name,
      type_of_gene: h.type_of_gene,
      taxid: h.taxid,
      entrezgene: h.entrezgene,
      summary: h.summary,
    };
  }
}
