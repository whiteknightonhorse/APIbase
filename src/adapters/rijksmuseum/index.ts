import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { RijksSearchOutput, RijksSearchResult, RijksArtworkDetails } from './types';

const RIJKS_BASE = 'https://data.rijksmuseum.nl';

/**
 * Rijksmuseum adapter (UC-379).
 *
 * New Linked Open Data Search API (the legacy Collection API was deprecated
 * in 2026). Returns Linked Art JSON-LD (CIDOC CRM format). No auth required.
 * CC-BY license — commercial use allowed with attribution.
 */
export class RijksmuseumAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'rijksmuseum', baseUrl: RIJKS_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'rijks.search': {
        const qp = new URLSearchParams();
        if (params.title) qp.set('title', String(params.title));
        if (params.description) qp.set('description', String(params.description));
        if (params.creation_date) qp.set('creationDate', String(params.creation_date));
        if (params.object_number) qp.set('objectNumber', String(params.object_number));
        return {
          url: `${RIJKS_BASE}/search/collection?${qp.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'rijks.details': {
        const objectId = String(params.object_id).replace(/[^0-9]/g, '');
        if (!objectId) {
          // Caller-supplied input error (non-numeric object_id), not an upstream
          // fault. Surface as 422 INPUT_REJECTED so agents fix the request rather
          // than reading it as a gateway 502 (flywheel rule 2026-06-06).
          throw {
            code: ProviderErrorCode.INPUT_REJECTED,
            httpStatus: 422,
            message: `Invalid object_id: must be the numeric Rijksmuseum ID (e.g. "200107928" for The Night Watch). Call rijks.search first and pass the "id" field from a result — not a title or object_number like "SK-C-5".`,
            provider: this.provider,
            toolId: req.toolId,
            durationMs: 0,
          };
        }
        return {
          url: `https://id.rijksmuseum.nl/${objectId}`,
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

    switch (req.toolId) {
      case 'rijks.search':
        return this.parseSearch(body);
      case 'rijks.details':
        return this.parseDetails(body);
      default:
        return body;
    }
  }

  private parseSearch(body: Record<string, unknown>): RijksSearchOutput {
    const partOf = (body.partOf ?? {}) as Record<string, unknown>;
    const total = Number(partOf.totalItems ?? 0);
    const items = (body.orderedItems ?? []) as Array<Record<string, unknown>>;

    return {
      total,
      results: items.slice(0, 50).map((item): RijksSearchResult => {
        const id = String(item.id ?? '');
        const numericId = id.split('/').pop() ?? '';
        return {
          id: numericId,
          url: id,
        };
      }),
    };
  }

  private parseDetails(body: Record<string, unknown>): RijksArtworkDetails {
    if (!body.id) {
      throw {
        code: ProviderErrorCode.INVALID_RESPONSE,
        httpStatus: 502,
        message: `Rijksmuseum returned empty object`,
        provider: this.provider,
        durationMs: 0,
      };
    }

    // Extract titles and object number from identified_by
    const identifiedBy = (body.identified_by ?? []) as Array<Record<string, unknown>>;
    let title = '';
    const altTitles: string[] = [];
    let objectNumber = '';

    for (const ident of identifiedBy) {
      const content = String(ident.content ?? '');
      const type = String(ident.type ?? '');
      if (type === 'Name' && content) {
        if (!title) title = content;
        else altTitles.push(content);
      } else if (type === 'Identifier' && content) {
        objectNumber = content;
      }
    }

    // Extract production info
    const producedBy = (body.produced_by ?? {}) as Record<string, unknown>;
    const timespan = (producedBy.timespan ?? {}) as Record<string, unknown>;
    const tsIdentifiedBy = (timespan.identified_by ?? []) as Array<Record<string, unknown>>;
    const creationDate = tsIdentifiedBy[0] ? String(tsIdentifiedBy[0].content ?? '') : '';

    const tookPlaceAt = (producedBy.took_place_at ?? []) as Array<Record<string, unknown>>;
    const producedAt = tookPlaceAt[0]
      ? String(
          ((tookPlaceAt[0].identified_by ?? []) as Array<Record<string, string>>)[0]?.content ?? '',
        )
      : '';

    // Materials
    const madeOf = (body.made_of ?? []) as Array<Record<string, unknown>>;
    const materials = madeOf
      .map((m) => {
        const names = (m.identified_by ?? []) as Array<Record<string, string>>;
        return names[0]?.content ?? '';
      })
      .filter(Boolean)
      .slice(0, 5);

    // Dimensions (from dimension field)
    const dimensionList = (body.dimension ?? []) as Array<Record<string, unknown>>;
    const dimensions = dimensionList
      .map((d) => {
        const value = d.value ?? '';
        const unit = (d.unit ?? {}) as Record<string, unknown>;
        const unitIds = (unit.identified_by ?? []) as Array<Record<string, string>>;
        return `${String(value)} ${unitIds[0]?.content ?? ''}`.trim();
      })
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');

    // Current location
    const currentLocation = (body.current_location ?? {}) as Record<string, unknown>;
    const locIdentifiedBy = (currentLocation.identified_by ?? []) as Array<Record<string, string>>;
    const location = locIdentifiedBy[0]?.content ?? '';

    return {
      id: String(body.id).split('/').pop() ?? '',
      url: String(body.id),
      title,
      alt_titles: altTitles.slice(0, 3),
      object_number: objectNumber,
      type: String(body.type ?? ''),
      creation_date: creationDate,
      produced_at: producedAt,
      materials,
      dimensions,
      current_location: location,
    };
  }
}
