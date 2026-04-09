import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { MetSearchOutput, MetDetailsOutput } from './types';

const MET_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';

/**
 * Met Museum Open Access adapter (UC-373).
 *
 * 470K+ artworks spanning 5,000 years. CC0 public domain, no auth, unlimited.
 */
export class MetMuseumAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'met-museum', baseUrl: MET_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'met.search': {
        const qp = new URLSearchParams();
        qp.set('q', String(params.query));
        if (params.has_images !== false) qp.set('hasImages', 'true');
        if (params.department_id) qp.set('departmentId', String(params.department_id));
        if (params.is_public_domain) qp.set('isOnView', 'true');
        if (params.medium) qp.set('medium', String(params.medium));
        if (params.geo_location) qp.set('geoLocation', String(params.geo_location));
        if (params.date_begin && params.date_end) {
          qp.set('dateBegin', String(params.date_begin));
          qp.set('dateEnd', String(params.date_end));
        }
        return { url: `${MET_BASE}/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'met.details': {
        const objectId = Number(params.object_id);
        if (!Number.isInteger(objectId) || objectId <= 0) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 400,
            message: `Invalid object_id: must be a positive integer (e.g. 436524 for Van Gogh's Sunflowers)`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return { url: `${MET_BASE}/objects/${objectId}`, method: 'GET', headers };
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
      case 'met.search':
        return this.parseSearch(body);
      case 'met.details':
        return this.parseDetails(body);
      default:
        return body;
    }
  }

  private parseSearch(body: Record<string, unknown>): MetSearchOutput {
    const total = Number(body.total ?? 0);
    const objectIDs = (body.objectIDs ?? []) as number[];

    return {
      total,
      object_ids: objectIDs.slice(0, 100),
    };
  }

  private parseDetails(body: Record<string, unknown>): MetDetailsOutput {
    if (!body.objectID) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Met Museum returned empty object: ${JSON.stringify(body).slice(0, 200)}`,
        provider: this.provider,
        durationMs: 0,
      };
    }

    return {
      object_id: Number(body.objectID ?? 0),
      title: String(body.title ?? ''),
      artist: String(body.artistDisplayName ?? ''),
      artist_nationality: String(body.artistNationality ?? ''),
      date: String(body.objectDate ?? ''),
      medium: String(body.medium ?? ''),
      department: String(body.department ?? ''),
      culture: String(body.culture ?? ''),
      period: String(body.period ?? ''),
      dimensions: String(body.dimensions ?? ''),
      classification: String(body.classification ?? ''),
      is_public_domain: Boolean(body.isPublicDomain),
      primary_image: String(body.primaryImage ?? ''),
      additional_images: ((body.additionalImages ?? []) as string[]).slice(0, 5),
      gallery_number: String(body.GalleryNumber ?? ''),
      accession_number: String(body.accessionNumber ?? ''),
      url: String(body.objectURL ?? ''),
    };
  }
}
