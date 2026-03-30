import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { DHLResponse, DHLTrackOutput } from './types';

/**
 * DHL Shipment Tracking adapter (UC-228).
 *
 * Supported tools:
 *   dhl.track → GET /shipments?trackingNumber=
 *
 * Auth: DHL-API-Key header. Production Europe. 250 req/day free.
 * Official DHL data — 220+ countries.
 */
export class DhlAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: 'dhl',
      baseUrl: 'https://api-eu.dhl.com/track',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'dhl.track': {
        const tn = encodeURIComponent(String(params.tracking_number ?? ''));
        return {
          url: `${this.baseUrl}/shipments?trackingNumber=${tn}`,
          method: 'GET',
          headers: { 'DHL-API-Key': this.apiKey },
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
    const tn = String(params.tracking_number ?? '');

    // 404 = tracking number not found
    if (raw.status === 404 || (body.status as number) === 404) {
      return {
        tracking_number: tn,
        service: '',
        status: 'not_found',
        status_code: '',
        status_description: String(body.title ?? 'No shipment found'),
        origin: '',
        destination: '',
        estimated_delivery: null,
        events: [],
        events_count: 0,
        found: false,
      } satisfies DHLTrackOutput;
    }

    const data = body as unknown as DHLResponse;
    const shipments = data.shipments ?? [];

    if (shipments.length === 0) {
      return {
        tracking_number: tn,
        service: '',
        status: 'not_found',
        status_code: '',
        status_description: 'No shipment data',
        origin: '',
        destination: '',
        estimated_delivery: null,
        events: [],
        events_count: 0,
        found: false,
      } satisfies DHLTrackOutput;
    }

    const s = shipments[0];
    return {
      tracking_number: s.id ?? tn,
      service: s.service ?? '',
      status: s.status?.status ?? '',
      status_code: s.status?.statusCode ?? '',
      status_description: s.status?.description ?? '',
      origin: s.origin?.address
        ? `${s.origin.address.addressLocality ?? ''}, ${s.origin.address.countryCode ?? ''}`
        : '',
      destination: s.destination?.address
        ? `${s.destination.address.addressLocality ?? ''}, ${s.destination.address.countryCode ?? ''}`
        : '',
      estimated_delivery: s.estimatedTimeOfDelivery ?? null,
      events: (s.events ?? []).map((e) => ({
        datetime: e.timestamp ?? '',
        location: e.location?.address
          ? `${e.location.address.addressLocality ?? ''}, ${e.location.address.countryCode ?? ''}`
          : '',
        status: e.status ?? '',
        description: e.description ?? '',
      })),
      events_count: (s.events ?? []).length,
      found: true,
    } satisfies DHLTrackOutput;
  }
}
