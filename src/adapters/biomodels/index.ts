import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  BioModelsSearchRaw,
  BioModelsModelDetailRaw,
  BioModelsSearchOutput,
  BioModelsModelDetailOutput,
  BioModelsFilesOutput,
  BioModelsLatestOutput,
  BioModelsModelSummary,
} from './types';

const BIOMODELS_BASE = 'https://biomodels.org';

export class BioModelsAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'biomodels', baseUrl: BIOMODELS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'biomodels.model.search': {
        const qp = new URLSearchParams();
        qp.set('query', String(params.query || '*'));
        qp.set('numResults', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('format', 'json');
        if (params.curation_status) {
          qp.set('curationstatus', String(params.curation_status));
        }
        if (params.offset) {
          qp.set('offset', String(Number(params.offset)));
        }
        return { url: `${BIOMODELS_BASE}/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'biomodels.model.detail': {
        const id = encodeURIComponent(String(params.model_id));
        return { url: `${BIOMODELS_BASE}/${id}?format=json`, method: 'GET', headers };
      }

      case 'biomodels.model.files': {
        const id = encodeURIComponent(String(params.model_id));
        return { url: `${BIOMODELS_BASE}/${id}?format=json`, method: 'GET', headers };
      }

      case 'biomodels.model.latest': {
        const qp = new URLSearchParams();
        qp.set('query', '*');
        qp.set('numResults', String(Math.min(Number(params.limit) || 10, 50)));
        qp.set('format', 'json');
        qp.set('curationstatus', 'CURATED');
        qp.set('sortBy', 'lastModified');
        qp.set('sortDirection', 'desc');
        return { url: `${BIOMODELS_BASE}/search?${qp.toString()}`, method: 'GET', headers };
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
      case 'biomodels.model.search':
        return this.parseSearch(body as unknown as BioModelsSearchRaw);
      case 'biomodels.model.detail':
        return this.parseDetail(
          body as unknown as BioModelsModelDetailRaw,
          req.params as Record<string, unknown>,
        );
      case 'biomodels.model.files':
        return this.parseFiles(
          body as unknown as BioModelsModelDetailRaw,
          req.params as Record<string, unknown>,
        );
      case 'biomodels.model.latest':
        return this.parseLatest(body as unknown as BioModelsSearchRaw);
      default:
        return body;
    }
  }

  private toSummary(m: {
    id: string;
    name: string;
    format: string;
    submissionDate?: string | null;
    lastModified?: string | null;
    submitter?: string;
    url?: string;
  }): BioModelsModelSummary {
    return {
      id: m.id,
      name: m.name,
      format: m.format,
      submission_date: m.submissionDate ?? null,
      last_modified: m.lastModified ?? null,
      submitter: m.submitter ?? '',
      url: m.url ?? `https://biomodels.org/${m.id}`,
    };
  }

  private parseSearch(body: BioModelsSearchRaw): BioModelsSearchOutput {
    const models = (body.models ?? []).map((m) => this.toSummary(m));
    return {
      total: body.matches ?? models.length,
      returned: models.length,
      models,
    };
  }

  private parseDetail(
    body: BioModelsModelDetailRaw,
    params: Record<string, unknown>,
  ): BioModelsModelDetailOutput {
    const pub = body.publication;
    return {
      id: String(params.model_id),
      name: body.name ?? '',
      curation_status: body.curationStatus ?? 'UNKNOWN',
      modelling_approach: body.modellingApproach?.name ?? null,
      format: body.format?.name ?? '',
      format_version: body.format?.version ?? '',
      first_published: body.firstPublished ?? null,
      description_text: stripHtml(body.description ?? '').slice(0, 2000),
      publication: pub
        ? {
            pmid: pub.type === 'PubMed ID' ? pub.accession : null,
            title: pub.title ?? '',
            journal: pub.journal ?? '',
            year: pub.year ?? 0,
            authors: (pub.authors ?? []).map((a) => ({
              name: a.name,
              ...(a.institution ? { institution: a.institution } : {}),
              ...(a.orcid ? { orcid: a.orcid } : {}),
            })),
            link: pub.link ?? '',
          }
        : null,
      contributors: Object.fromEntries(
        Object.entries(body.contributors ?? {}).map(([role, people]) => [
          role,
          (people as Array<{ name: string }>).map((p) => p.name),
        ]),
      ),
      annotations: (body.modelLevelAnnotations ?? []).map((a) => ({
        qualifier: a.qualifier,
        resource: a.resource,
        accession: a.accession,
        uri: a.uri,
      })),
      main_files: (body.files?.main ?? []).map((f) => f.name),
      additional_files: (body.files?.additional ?? []).map((f) => f.name),
    };
  }

  private parseFiles(
    body: BioModelsModelDetailRaw,
    params: Record<string, unknown>,
  ): BioModelsFilesOutput {
    const modelId = String(params.model_id);
    const mapFile = (f: {
      name: string;
      description: string;
      mimeType: string;
      fileSize: string;
      md5sum: string;
    }) => ({
      name: f.name,
      description: f.description ?? '',
      mime_type: f.mimeType ?? '',
      size_bytes: Number(f.fileSize) || 0,
      md5: f.md5sum ?? '',
      download_url: `https://biomodels.org/model/download/${modelId}?filename=${encodeURIComponent(f.name)}`,
    });
    return {
      id: modelId,
      main: (body.files?.main ?? []).map(mapFile),
      additional: (body.files?.additional ?? []).map(mapFile),
    };
  }

  private parseLatest(body: BioModelsSearchRaw): BioModelsLatestOutput {
    const models = (body.models ?? []).map((m) => this.toSummary(m));
    return {
      total_curated: body.matches ?? models.length,
      returned: models.length,
      models,
    };
  }
}
