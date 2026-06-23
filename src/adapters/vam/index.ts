import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  VamSearchResponse,
  VamObjectResponse,
  VamObjectSummary,
  VamSearchOutput,
  VamObjectDetailOutput,
} from './types';

const VAM_BASE = 'https://api.vam.ac.uk/v2';

export class VamAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'vam', baseUrl: VAM_BASE });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase/2.0 (https://apibase.pro)',
    };

    switch (req.toolId) {
      case 'vam.search': {
        const qp = new URLSearchParams();
        if (params.query) qp.set('q', String(params.query));
        if (params.object_type)
          qp.set('object_type', encodeURIComponent(String(params.object_type)));
        if (params.on_display !== undefined)
          qp.set('on_display', params.on_display ? 'true' : 'false');
        if (params.year_from) qp.set('year_made_from', String(Number(params.year_from)));
        if (params.year_to) qp.set('year_made_to', String(Number(params.year_to)));
        qp.set('page_size', String(Math.min(Number(params.page_size) || 10, 30)));
        qp.set('page', String(Number(params.page) || 1));
        return { url: `${VAM_BASE}/objects/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'vam.object': {
        const id = encodeURIComponent(String(params.system_number));
        return { url: `${VAM_BASE}/museumobject/${id}`, method: 'GET', headers };
      }

      case 'vam.by_maker': {
        const qp = new URLSearchParams();
        qp.set('maker', encodeURIComponent(String(params.maker)));
        if (params.object_type)
          qp.set('object_type', encodeURIComponent(String(params.object_type)));
        qp.set('page_size', String(Math.min(Number(params.page_size) || 10, 30)));
        qp.set('page', String(Number(params.page) || 1));
        return { url: `${VAM_BASE}/objects/search?${qp.toString()}`, method: 'GET', headers };
      }

      case 'vam.by_category': {
        const qp = new URLSearchParams();
        if (params.query) qp.set('q', String(params.query));
        qp.set('id_category', encodeURIComponent(String(params.category_id)));
        if (params.on_display !== undefined)
          qp.set('on_display', params.on_display ? 'true' : 'false');
        qp.set('page_size', String(Math.min(Number(params.page_size) || 10, 30)));
        qp.set('page', String(Number(params.page) || 1));
        return { url: `${VAM_BASE}/objects/search?${qp.toString()}`, method: 'GET', headers };
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
      case 'vam.search':
      case 'vam.by_maker':
      case 'vam.by_category':
        return this.parseSearch(body as unknown as VamSearchResponse);
      case 'vam.object':
        return this.parseObjectDetail(body as unknown as VamObjectResponse);
      default:
        return body;
    }
  }

  private parseSearch(body: VamSearchResponse): VamSearchOutput {
    const info = body.info ?? ({} as VamSearchResponse['info']);
    const records = body.records ?? [];
    return {
      total: Number(info.record_count ?? 0),
      page: Number(info.page ?? 1),
      pages: Number(info.pages ?? 1),
      results: records.map(
        (r): VamObjectSummary => ({
          system_number: r.systemNumber ?? '',
          accession_number: r.accessionNumber ?? '',
          object_type: r.objectType ?? '',
          title: r._primaryTitle ?? '',
          maker: r._primaryMaker?.name ?? '',
          date: r._primaryDate ?? '',
          place: r._primaryPlace ?? '',
          thumbnail_url: r._images?._primary_thumbnail ?? null,
          iiif_image_base: r._images?._iiif_image_base_url ?? null,
          on_display: r._currentLocation?.onDisplay ?? false,
          location: r._currentLocation?.displayName ?? '',
        }),
      ),
    };
  }

  private parseObjectDetail(body: VamObjectResponse): VamObjectDetailOutput {
    const r = body.record ?? ({} as VamObjectResponse['record']);
    const meta = body.meta ?? {};

    const title = r.titles?.[0]?.title ?? r.objectType ?? '';
    const makers = (r.artistMakerPerson ?? []).map((m) => ({
      name: m.name?.text ?? '',
      role: m.association?.text ?? '',
    }));
    const materials = (r.materials ?? []).map((m) => m.text ?? '').filter(Boolean);
    const techniques = (r.techniques ?? []).map((t) => t.text ?? '').filter(Boolean);
    const categories = (r.categories ?? []).map((c) => c.text ?? '').filter(Boolean);
    const styles = (r.styles ?? []).map((s) => s.text ?? '').filter(Boolean);

    const dateEntry = r.productionDates?.[0]?.date;
    const placeEntry = r.placesOfOrigin?.[0]?.place;
    const galleryEntry = r.galleryLocations?.[0];
    const onDisplay = galleryEntry?.current?.id
      ? !String(galleryEntry.current.id).includes('storage')
      : false;

    const thumbnail = meta.images?._primary_thumbnail ?? null;
    const iiifBase = meta.images?._iiif_image ?? null;

    return {
      system_number: r.systemNumber ?? '',
      accession_number: r.accessionNumber ?? '',
      object_type: r.objectType ?? '',
      title,
      summary_description: (r.summaryDescription ?? '').slice(0, 2000),
      physical_description: (r.physicalDescription ?? '').slice(0, 1000),
      makers,
      materials,
      techniques,
      categories,
      styles,
      date: dateEntry?.text ?? '',
      date_earliest: dateEntry?.earliest ?? null,
      date_latest: dateEntry?.latest ?? null,
      place_of_origin: placeEntry?.text ?? '',
      collection: r.collectionCode?.text ?? '',
      on_display: onDisplay,
      gallery: galleryEntry?.current?.text ?? '',
      thumbnail_url: thumbnail,
      iiif_image_base: iiifBase,
      collection_page_url: `https://collections.vam.ac.uk/item/${r.systemNumber}/`,
    };
  }
}
