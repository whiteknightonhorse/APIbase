import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  UkhsaDashboardBrowseLink,
  UkhsaDashboardBrowseOutput,
  UkhsaDashboardMetricDataResponse,
  UkhsaDashboardMetricDataOutput,
} from './types';

const UKHSA_BASE = 'https://api.ukhsa-dashboard.data.gov.uk';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * UKHSA Data Dashboard public REST API adapter (UC-653).
 *
 * The dashboard exposes a fixed 6-level drill-down hierarchy — theme -> sub_theme -> topic ->
 * geography_type -> geography -> metric — where each intermediate level is a browse-only list
 * endpoint (`[{name, link}]`) and the leaf metric endpoint returns the actual paginated
 * timeseries (`{count, next, previous, results: [...]}`). No query-parameter search exists at
 * any level (unlike CKAN-style catalogs), so browsing is the only discovery path.
 *
 *   ukhsa-dashboard.browse       -> GET the next-level list for however many path segments are
 *                                    supplied (0 segments = themes, 5 segments = metrics)
 *   ukhsa-dashboard.metric_data  -> GET the leaf metric's paginated data points, with optional
 *                                    year/epiweek/date/age/sex/stratum/in_reporting_delay_period
 *                                    filters (all upstream-supported query params)
 *
 * Auth: None. Public UK Health Security Agency dataset, Open Government Licence v3.0. The
 * Django REST Framework browsable API returns HTML unless `Accept: application/json` is sent.
 * The base domain itself has no `/api` prefix — the candidate URL's `/api` suffix 404s.
 */
export class UkhsaDashboardAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'ukhsa-dashboard', baseUrl: UKHSA_BASE, maxResponseBytes: 1_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'ukhsa-dashboard.browse': {
        const theme = this.trimmed(params.theme);
        const subTheme = this.trimmed(params.sub_theme);
        const topic = this.trimmed(params.topic);
        const geographyType = this.trimmed(params.geography_type);
        const geography = this.trimmed(params.geography);

        if (subTheme && !theme) {
          throw this.invalidInput(req.toolId, 'theme is required when sub_theme is given');
        }
        if (topic && !(theme && subTheme)) {
          throw this.invalidInput(
            req.toolId,
            'theme and sub_theme are required when topic is given',
          );
        }
        if (geographyType && !(theme && subTheme && topic)) {
          throw this.invalidInput(
            req.toolId,
            'theme, sub_theme, and topic are required when geography_type is given',
          );
        }
        if (geography && !(theme && subTheme && topic && geographyType)) {
          throw this.invalidInput(
            req.toolId,
            'theme, sub_theme, topic, and geography_type are required when geography is given',
          );
        }

        let path = '/themes/';
        if (theme) path = `/themes/${encodeURIComponent(theme)}/sub_themes/`;
        if (theme && subTheme) {
          path = `/themes/${encodeURIComponent(theme)}/sub_themes/${encodeURIComponent(subTheme)}/topics`;
        }
        if (theme && subTheme && topic) {
          path =
            `/themes/${encodeURIComponent(theme)}/sub_themes/${encodeURIComponent(subTheme)}` +
            `/topics/${encodeURIComponent(topic)}/geography_types`;
        }
        if (theme && subTheme && topic && geographyType) {
          path =
            `/themes/${encodeURIComponent(theme)}/sub_themes/${encodeURIComponent(subTheme)}` +
            `/topics/${encodeURIComponent(topic)}/geography_types/${encodeURIComponent(geographyType)}/geographies`;
        }
        if (theme && subTheme && topic && geographyType && geography) {
          path =
            `/themes/${encodeURIComponent(theme)}/sub_themes/${encodeURIComponent(subTheme)}` +
            `/topics/${encodeURIComponent(topic)}/geography_types/${encodeURIComponent(geographyType)}` +
            `/geographies/${encodeURIComponent(geography)}/metrics`;
        }

        return { url: `${UKHSA_BASE}${path}`, method: 'GET', headers };
      }

      case 'ukhsa-dashboard.metric_data': {
        const theme = this.trimmed(params.theme);
        const subTheme = this.trimmed(params.sub_theme);
        const topic = this.trimmed(params.topic);
        const geographyType = this.trimmed(params.geography_type);
        const geography = this.trimmed(params.geography);
        const metric = this.trimmed(params.metric);
        if (!theme || !subTheme || !topic || !geographyType || !geography || !metric) {
          throw this.invalidInput(
            req.toolId,
            'theme, sub_theme, topic, geography_type, geography, and metric are all required — ' +
              'use ukhsa-dashboard.browse to discover valid values at each level',
          );
        }

        const qs = new URLSearchParams();
        qs.set('page', String(this.clamp(params.page, 1, 1, 100_000)));
        qs.set('page_size', String(this.clamp(params.page_size, 100, 1, 500)));
        if (params.year !== undefined)
          qs.set('year', String(this.clamp(params.year, 0, 2000, 2100)));
        if (params.epiweek !== undefined) {
          qs.set('epiweek', String(this.clamp(params.epiweek, 0, 1, 53)));
        }
        const date = this.trimmed(params.date);
        if (date) {
          if (!DATE_RE.test(date)) {
            throw this.invalidInput(req.toolId, 'date must be in YYYY-MM-DD format');
          }
          qs.set('date', date);
        }
        const age = this.trimmed(params.age);
        if (age) qs.set('age', age);
        const sex = this.trimmed(params.sex);
        if (sex) qs.set('sex', sex);
        const stratum = this.trimmed(params.stratum);
        if (stratum) qs.set('stratum', stratum);
        if (params.in_reporting_delay_period !== undefined) {
          qs.set('in_reporting_delay_period', String(Boolean(params.in_reporting_delay_period)));
        }

        const path =
          `/themes/${encodeURIComponent(theme)}/sub_themes/${encodeURIComponent(subTheme)}` +
          `/topics/${encodeURIComponent(topic)}/geography_types/${encodeURIComponent(geographyType)}` +
          `/geographies/${encodeURIComponent(geography)}/metrics/${encodeURIComponent(metric)}`;

        return { url: `${UKHSA_BASE}${path}?${qs.toString()}`, method: 'GET', headers };
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'ukhsa-dashboard.browse': {
        const links = raw.body as UkhsaDashboardBrowseLink[];
        const depth = [
          params.theme,
          params.sub_theme,
          params.topic,
          params.geography_type,
          params.geography,
        ].filter((v) => this.trimmed(v)).length;
        const levels: UkhsaDashboardBrowseOutput['level'][] = [
          'themes',
          'sub_themes',
          'topics',
          'geography_types',
          'geographies',
          'metrics',
        ];
        const output: UkhsaDashboardBrowseOutput = {
          level: levels[depth],
          total: links.length,
          items: links.map((l) => l.name),
        };
        return output;
      }

      case 'ukhsa-dashboard.metric_data': {
        const env = raw.body as UkhsaDashboardMetricDataResponse;
        const output: UkhsaDashboardMetricDataOutput = {
          theme: String(params.theme),
          sub_theme: String(params.sub_theme),
          topic: String(params.topic),
          geography_type: String(params.geography_type),
          geography: String(params.geography),
          metric: String(params.metric),
          total: env.count,
          page: this.clamp(params.page, 1, 1, 100_000),
          has_more: env.next !== null,
          data_points: env.results.map((r) => ({
            date: r.date,
            year: r.year,
            month: r.month,
            epiweek: r.epiweek,
            metric_value: r.metric_value,
            sex: r.sex,
            age: r.age,
            stratum: r.stratum,
            in_reporting_delay_period: r.in_reporting_delay_period,
          })),
        };
        return output;
      }

      default:
        return raw.body;
    }
  }

  private trimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(Math.trunc(n), min), max);
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
}
