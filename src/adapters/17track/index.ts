import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  Track17RegisterAccepted,
  Track17RejectedItem,
  Track17TrackAccepted,
  Track17ListItem,
  Track17ListPage,
  TrackingRegisterResult,
  TrackingStatusResult,
  TrackingEvent,
  TrackingListResult,
} from './types';

/**
 * 17TRACK Package Tracking adapter (UC-221).
 *
 * Supported tools:
 *   tracking.register → POST /register   (consumes quota, auto-detects carrier)
 *   tracking.status   → POST /gettrackinfo (must register first)
 *   tracking.list     → POST /gettracklist (paginated list)
 *
 * Auth: 17token header. All endpoints POST + JSON body.
 * Free tier: 200 quota/month (consumed on /register only).
 */
export class TrackingAdapter extends BaseAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    super({
      provider: '17track',
      baseUrl: 'https://api.17track.net/track/v2.2',
    });
    this.apiKey = apiKey;
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      '17token': this.apiKey,
      'Content-Type': 'application/json',
    };

    switch (req.toolId) {
      case 'tracking.register': {
        const item: Record<string, unknown> = {
          number: params.tracking_number,
        };
        if (params.tag) item.tag = params.tag;
        return {
          url: `${this.baseUrl}/register`,
          method: 'POST',
          headers,
          body: JSON.stringify([item]),
        };
      }

      case 'tracking.status':
        return {
          url: `${this.baseUrl}/gettrackinfo`,
          method: 'POST',
          headers,
          body: JSON.stringify([{ number: params.tracking_number }]),
        };

      case 'tracking.list': {
        const listBody: Record<string, unknown> = {
          page_no: params.page ?? 1,
          page_size: params.page_size ?? 20,
        };
        if (params.status) listBody.package_status = params.status;
        return {
          url: `${this.baseUrl}/gettracklist`,
          method: 'POST',
          headers,
          body: JSON.stringify(listBody),
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

    // Top-level API error (auth failure, invalid URL, etc.)
    if (body.code !== 0) {
      return {
        error: true,
        error_code: body.code,
        error_message: (body as Record<string, unknown>).message ?? 'Unknown 17TRACK API error',
      };
    }

    switch (req.toolId) {
      case 'tracking.register':
        return this.parseRegister(body);
      case 'tracking.status':
        return this.parseStatus(body);
      case 'tracking.list':
        return this.parseList(body);
      default:
        return body;
    }
  }

  private parseRegister(body: Record<string, unknown>): TrackingRegisterResult {
    const data = body.data as Record<string, unknown>;
    const accepted = (data.accepted ?? []) as Track17RegisterAccepted[];
    const rejected = (data.rejected ?? []) as Track17RejectedItem[];

    if (accepted.length > 0) {
      const item = accepted[0];
      return {
        tracking_number: item.number,
        carrier_code: item.carrier,
        carrier_name: null, // carrier name not returned on register
        status: item.origin === 2 ? 'already_registered' : 'registered',
        is_new: item.origin === 3,
        error_message: null,
      };
    }

    if (rejected.length > 0) {
      const item = rejected[0];
      const isAlreadyRegistered = item.error.code === -18019901;
      return {
        tracking_number: item.number,
        carrier_code: null,
        carrier_name: null,
        status: isAlreadyRegistered ? 'already_registered' : 'error',
        is_new: false,
        error_message: isAlreadyRegistered ? null : item.error.message,
      };
    }

    return {
      tracking_number: '',
      carrier_code: null,
      carrier_name: null,
      status: 'error',
      is_new: false,
      error_message: 'No data returned from 17TRACK',
    };
  }

  private parseStatus(body: Record<string, unknown>): TrackingStatusResult {
    const data = body.data as Record<string, unknown>;
    const accepted = (data.accepted ?? []) as Track17TrackAccepted[];
    const rejected = (data.rejected ?? []) as Track17RejectedItem[];

    // Handle rejected (not registered, no data yet, etc.)
    if (rejected.length > 0 && accepted.length === 0) {
      const item = rejected[0];
      const isNotRegistered = item.error.code === -18019902;
      const isNoData = item.error.code === -18019909;
      return {
        tracking_number: item.number,
        carrier_code: null,
        carrier_name: null,
        status: isNotRegistered ? 'not_registered' : isNoData ? 'pending' : 'error',
        latest_event: null,
        events: [],
        milestones: [],
        days_in_transit: null,
        origin: null,
        destination: null,
        error_message: isNoData
          ? 'Tracking data not yet available. Check again in a few minutes.'
          : isNotRegistered
            ? 'Tracking number not registered. Call tracking.register first.'
            : item.error.message,
      };
    }

    if (accepted.length === 0) {
      return {
        tracking_number: '',
        carrier_code: null,
        carrier_name: null,
        status: 'error',
        latest_event: null,
        events: [],
        milestones: [],
        days_in_transit: null,
        origin: null,
        destination: null,
        error_message: 'No data returned from 17TRACK',
      };
    }

    const item = accepted[0];
    const info = item.track_info;
    const providers = info?.tracking?.providers ?? [];
    const firstProvider = providers[0];

    // Collect all events from first provider
    const events: TrackingEvent[] = (firstProvider?.events ?? []).map((e) => ({
      datetime: e.time_iso,
      location: e.location ?? '',
      description: e.description ?? '',
      stage: e.stage ?? '',
    }));

    // Latest event
    const latestRaw = info?.latest_event;
    const latestEvent: TrackingEvent | null = latestRaw
      ? {
          datetime: latestRaw.time_iso,
          location: latestRaw.location ?? '',
          description: latestRaw.description ?? '',
          stage: latestRaw.stage ?? '',
        }
      : null;

    // Milestones
    const milestones = (info?.milestone ?? []).map((m) => ({
      stage: m.key_stage,
      datetime: m.time_iso,
    }));

    return {
      tracking_number: item.number,
      carrier_code: item.carrier,
      carrier_name: firstProvider?.provider?.name ?? null,
      status: info?.latest_status?.status ?? 'Unknown',
      latest_event: latestEvent,
      events,
      milestones,
      days_in_transit: info?.time_metrics?.days_of_transit ?? null,
      origin: info?.shipping_info?.shipper_address?.country || null,
      destination: info?.shipping_info?.recipient_address?.country || null,
      error_message: null,
    };
  }

  private parseList(body: Record<string, unknown>): TrackingListResult {
    const data = body.data as Record<string, unknown>;
    const page = body.page as Track17ListPage | undefined;
    const accepted = (data?.accepted ?? []) as Track17ListItem[];

    return {
      items: accepted.map((item) => ({
        tracking_number: item.number,
        carrier_code: item.carrier,
        status: item.package_status ?? 'Unknown',
        latest_event: item.latest_event_info ?? '',
        latest_event_time: item.latest_event_time ?? '',
        days_in_transit: item.days_of_transit ?? '',
        registered_at: item.register_time ?? '',
      })),
      total: page?.data_total ?? accepted.length,
      page: page?.page_no ?? 1,
      page_size: page?.page_size ?? 20,
      has_next: page?.has_next ?? false,
    };
  }
}
