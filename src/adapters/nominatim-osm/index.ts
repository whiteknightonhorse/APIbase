import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  NominatimSearchResponse,
  NominatimReverseResponse,
  NominatimLookupResponse,
} from './types';

/**
 * Nominatim (OpenStreetMap) adapter (UC-734) — free, no-auth geocoding over
 * OSM data: forward search, reverse geocoding, and batch OSM-id lookup.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 *   - Max ~1 request/sec from a single client — this adapter never fans a
 *     single tool call out into multiple upstream requests, and per-tool
 *     `cache_ttl` (config/tool_provider_config.yaml) absorbs repeat lookups
 *     for the same query at the pipeline cache layer instead of re-hitting
 *     the upstream.
 *   - A descriptive User-Agent identifying the calling application is
 *     required (no default/browser UA) — set unconditionally below.
 *   - Bulk geocoding / heavy automated use is disallowed; this adapter only
 *     ever issues one request per incoming tool call, never a scripted loop.
 *   - Attribution ("© OpenStreetMap contributors", ODbL) is required on any
 *     display of results — Nominatim already embeds a `licence` string on
 *     every returned place, which this adapter passes through unmodified.
 */
export class NominatimOsmAdapter extends BaseAdapter {
  private static readonly USER_AGENT = 'APIbase.pro/1.0 (+https://apibase.pro)';

  constructor() {
    super({
      provider: 'nominatim-osm',
      baseUrl: 'https://nominatim.openstreetmap.org',
      // Retries would multiply requests against a 1 req/sec public service —
      // fail fast instead of retrying.
      maxRetries: 0,
    });
  }

  protected buildRequest(req: ProviderRequest) {
    const p = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': NominatimOsmAdapter.USER_AGENT,
    };
    const language = p.language ? String(p.language).trim() : undefined;
    if (language) headers['Accept-Language'] = language;

    switch (req.toolId) {
      case 'nominatim-osm.search': {
        const qs = new URLSearchParams();
        qs.set('q', String(p.query ?? '').trim());
        qs.set('format', 'jsonv2');
        qs.set('addressdetails', '1');
        const limit = p.limit !== undefined ? Math.min(Math.max(Number(p.limit), 1), 50) : 5;
        qs.set('limit', String(limit));
        if (p.country_codes) {
          qs.set('countrycodes', String(p.country_codes).toLowerCase().replace(/\s+/g, ''));
        }
        return {
          url: `${this.baseUrl}/search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'nominatim-osm.reverse': {
        const qs = new URLSearchParams();
        qs.set('lat', String(p.lat));
        qs.set('lon', String(p.lon));
        qs.set('format', 'jsonv2');
        qs.set('addressdetails', '1');
        if (p.zoom !== undefined) {
          qs.set('zoom', String(Math.min(Math.max(Number(p.zoom), 0), 18)));
        }
        return {
          url: `${this.baseUrl}/reverse?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'nominatim-osm.lookup': {
        const ids = Array.isArray(p.osm_ids) ? (p.osm_ids as unknown[]) : [];
        const osmIds = ids
          .map((id) => String(id).trim().toUpperCase())
          .filter((id) => /^[NWR]\d+$/.test(id))
          .slice(0, 50);
        const qs = new URLSearchParams();
        qs.set('osm_ids', osmIds.join(','));
        qs.set('format', 'jsonv2');
        qs.set('addressdetails', '1');
        return {
          url: `${this.baseUrl}/lookup?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      default:
        throw {
          code: ProviderErrorCode.INVALID_RESPONSE,
          httpStatus: 502,
          message: `Unsupported: ${req.toolId}`,
          provider: this.provider,
          toolId: req.toolId,
          durationMs: 0,
        };
    }
  }

  protected parseResponse(raw: ProviderRawResponse, req: ProviderRequest): unknown {
    switch (req.toolId) {
      case 'nominatim-osm.search': {
        const data = raw.body as NominatimSearchResponse;
        if (!Array.isArray(data)) {
          throw new Error('Unexpected Nominatim search response (expected an array)');
        }
        return { count: data.length, results: data };
      }

      case 'nominatim-osm.reverse': {
        const data = raw.body as NominatimReverseResponse;
        if (data && typeof data === 'object' && 'error' in data) {
          return { found: false, error: data.error };
        }
        return { found: true, result: data };
      }

      case 'nominatim-osm.lookup': {
        const data = raw.body as NominatimLookupResponse;
        if (!Array.isArray(data)) {
          throw new Error('Unexpected Nominatim lookup response (expected an array)');
        }
        return { count: data.length, results: data };
      }

      default:
        return raw.body;
    }
  }
}
