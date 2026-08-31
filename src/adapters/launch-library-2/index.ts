import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  LaunchLibraryPage,
  LaunchLibraryLaunchSummary,
  LaunchLibraryLaunchDetail,
  LaunchLibraryAgencySummary,
  LaunchLibraryAstronautSummary,
} from './types';

const LL2_BASE = 'https://ll.thespacedevs.com/2.3.0';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Launch Library 2 (The Space Devs) API adapter (UC-645).
 *
 * ll.thespacedevs.com/2.3.0 is a no-auth, free-tier public REST API covering global orbital
 * launch schedules, astronauts, and space agencies, run by The Space Devs. The free anonymous
 * tier is throttled to only 15 requests/hour PER IP (self-reported live via the API's own
 * `/api-throttle/` endpoint: your_request_limit=15, limit_frequency_secs=3600) — since all
 * APIbase traffic egresses from one server IP, this budget is shared across every agent calling
 * these tools. Cache TTLs are set deliberately long (30min for the time-sensitive upcoming-launch
 * list, 1h for launch detail, 24h for astronauts/agencies which change rarely) to keep typical
 * demand within the shared hourly budget; a burst of distinct uncached queries can still exhaust
 * it, in which case the upstream throttle returns HTTP 429 and this adapter surfaces it as
 * ProviderErrorCode.RATE_LIMIT (no charge — pipeline fails closed before ESCROW_FINALIZE).
 *   launch-library-2.upcoming_launches -> upcoming orbital launch schedule, optional text search
 *   launch-library-2.launch_detail     -> full detail for one launch by UUID
 *   launch-library-2.astronaut_search  -> astronaut roster, optional text search
 *   launch-library-2.agency_search     -> space agency/operator directory, optional text search
 */
export class LaunchLibrary2Adapter extends BaseAdapter {
  constructor() {
    super({ provider: 'launch-library-2', baseUrl: LL2_BASE });
  }

  private invalidInput(toolId: string, message: string): never {
    throw {
      code: ProviderErrorCode.INPUT_REJECTED,
      httpStatus: 422,
      message,
      provider: this.provider,
      toolId,
      durationMs: 0,
    };
  }

  private optString(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s;
  }

  private clampLimit(value: unknown): number {
    const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n) || n < 1) return 10;
    return Math.min(Math.trunc(n), 20);
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const headers = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'launch-library-2.upcoming_launches': {
        const qs = new URLSearchParams({ limit: String(this.clampLimit(params.limit)) });
        const search = this.optString(params.search);
        if (search) qs.set('search', search);
        return { url: `${LL2_BASE}/launches/upcoming/?${qs.toString()}`, method: 'GET', headers };
      }

      case 'launch-library-2.launch_detail': {
        const id = this.optString(params.id);
        if (!id || !UUID_RE.test(id)) {
          throw this.invalidInput(
            req.toolId,
            'id is required and must be a launch UUID (see launch-library-2.upcoming_launches results)',
          );
        }
        return { url: `${LL2_BASE}/launches/${id}/`, method: 'GET', headers };
      }

      case 'launch-library-2.astronaut_search': {
        const qs = new URLSearchParams({ limit: String(this.clampLimit(params.limit)) });
        const search = this.optString(params.search);
        if (search) qs.set('search', search);
        return { url: `${LL2_BASE}/astronauts/?${qs.toString()}`, method: 'GET', headers };
      }

      case 'launch-library-2.agency_search': {
        const qs = new URLSearchParams({ limit: String(this.clampLimit(params.limit)) });
        const search = this.optString(params.search);
        if (search) qs.set('search', search);
        return { url: `${LL2_BASE}/agencies/?${qs.toString()}`, method: 'GET', headers };
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
    switch (req.toolId) {
      case 'launch-library-2.upcoming_launches': {
        const page = raw.body as LaunchLibraryPage<LaunchLibraryLaunchSummary>;
        return { returned: page.results.length, count: page.count, launches: page.results };
      }

      case 'launch-library-2.launch_detail': {
        return raw.body as LaunchLibraryLaunchDetail;
      }

      case 'launch-library-2.astronaut_search': {
        const page = raw.body as LaunchLibraryPage<LaunchLibraryAstronautSummary>;
        return { returned: page.results.length, count: page.count, astronauts: page.results };
      }

      case 'launch-library-2.agency_search': {
        const page = raw.body as LaunchLibraryPage<LaunchLibraryAgencySummary>;
        return { returned: page.results.length, count: page.count, agencies: page.results };
      }

      default:
        return raw.body;
    }
  }
}
