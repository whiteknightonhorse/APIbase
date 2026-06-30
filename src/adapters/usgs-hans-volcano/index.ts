import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import { stripHtml } from '../../utils/strip-html';
import type {
  MonitoredVolcano,
  CapElevatedVolcano,
  UsVolcano,
  VolcanoDetail,
  NewestNotice,
} from './types';

/**
 * USGS HANS Volcano adapter (UC-556).
 *
 * Supported tools (read-only):
 *   volcano.monitored     → GET /getMonitoredVolcanoes
 *   volcano.elevated      → GET /getElevatedVolcanoes
 *   volcano.cap_alerts    → GET /getCapElevated
 *   volcano.us_catalog    → GET /getUSVolcanoes
 *   volcano.detail        → GET /getVolcano/{id}
 *   volcano.latest_notice → GET /newestForVolcano/{id}
 *
 * Auth: None (US Government open data, public domain).
 */
export class UsgsHansVolcanoAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'usgs-hans-volcano',
      baseUrl: 'https://volcanoes.usgs.gov/hans-public/api/volcano',
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'APIbase.pro/1.0 (https://apibase.pro; infocitysms@gmail.com)',
    };

    switch (req.toolId) {
      case 'volcano.monitored':
        return { url: `${this.baseUrl}/getMonitoredVolcanoes`, method: 'GET', headers };

      case 'volcano.elevated':
        return { url: `${this.baseUrl}/getElevatedVolcanoes`, method: 'GET', headers };

      case 'volcano.cap_alerts':
        return { url: `${this.baseUrl}/getCapElevated`, method: 'GET', headers };

      case 'volcano.us_catalog': {
        const region = params.region as string | undefined;
        const qs = region ? `?region=${encodeURIComponent(region)}` : '';
        return { url: `${this.baseUrl}/getUSVolcanoes${qs}`, method: 'GET', headers };
      }

      case 'volcano.detail': {
        const id = encodeURIComponent(String(params.volcano_id ?? ''));
        return { url: `${this.baseUrl}/getVolcano/${id}`, method: 'GET', headers };
      }

      case 'volcano.latest_notice': {
        const id = encodeURIComponent(String(params.volcano_id ?? ''));
        return { url: `${this.baseUrl}/newestForVolcano/${id}`, method: 'GET', headers };
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
      case 'volcano.monitored': {
        const list = body as unknown as MonitoredVolcano[];
        return {
          count: list.length,
          volcanoes: list.map((v) => ({
            name: v.volcano_name,
            vnum: v.vnum,
            volcano_cd: v.volcano_cd,
            alert_level: v.alert_level,
            color_code: v.color_code,
            observatory: v.obs_fullname,
            last_notice_utc: v.sent_utc,
            notice_type: v.notice_type_cd,
            notice_url: v.notice_url,
          })),
        };
      }

      case 'volcano.elevated': {
        const list = body as unknown as MonitoredVolcano[];
        return {
          count: list.length,
          elevated_volcanoes: list.map((v) => ({
            name: v.volcano_name,
            vnum: v.vnum,
            volcano_cd: v.volcano_cd,
            alert_level: v.alert_level,
            color_code: v.color_code,
            observatory: v.obs_fullname,
            last_notice_utc: v.sent_utc,
            notice_type: v.notice_type_cd,
            notice_url: v.notice_url,
          })),
        };
      }

      case 'volcano.cap_alerts': {
        const list = body as unknown as CapElevatedVolcano[];
        return {
          count: list.length,
          cap_alerts: list.map((v) => ({
            name: v.volcano_name_appended,
            vnum: v.vnum,
            latitude: v.latitude,
            longitude: v.longitude,
            elevation_meters: v.elevation_meters,
            elevation_feet: v.elevation_feet,
            alert_level: v.alert_level,
            color_code: v.color_code,
            cap_certainty: v.cap_certainty,
            cap_severity: v.cap_severity,
            cap_urgency: v.cap_urgency,
            synopsis: v.synopsis ?? null,
            sent_date: v.sent_date_cap,
            expires: v.cap_expires,
            observatory: v.obs_fullname,
            notice_url: v.notice_url,
          })),
        };
      }

      case 'volcano.us_catalog': {
        const list = body as unknown as UsVolcano[];
        const params = req.params as Record<string, unknown>;
        const regionFilter = params.region as string | undefined;
        const filtered = regionFilter
          ? list.filter((v) => v.region.toLowerCase().includes(regionFilter.toLowerCase()))
          : list;
        return {
          count: filtered.length,
          volcanoes: filtered.map((v) => ({
            name: v.volcano_name,
            vnum: v.vnum,
            volcano_cd: v.volcano_cd,
            region: v.region,
            latitude: v.latitude,
            longitude: v.longitude,
            elevation_meters: v.elevation_meters,
            nvews_threat: v.nvews_threat,
            observatory: v.obs_fullname,
            volcano_url: v.volcano_url,
            image_url: v.volcano_image_url,
          })),
        };
      }

      case 'volcano.detail': {
        const v = body as unknown as VolcanoDetail;
        return {
          name: v.volcano_name,
          vnum: v.vnum,
          volcano_cd: v.volcano_cd,
          region: v.region,
          latitude: v.latitude,
          longitude: v.longitude,
          elevation_meters: v.elevation_meters,
          nvews_threat: v.nvews_threat,
          observatory: v.obs_fullname,
          description: stripHtml(v.boilerplate ?? ''),
          volcano_url: v.volcano_url,
          image_url: v.volcano_image_url,
          hans_url: v.hans_url ?? null,
          newest_notice_url: v.newest_notice_url ?? null,
        };
      }

      case 'volcano.latest_notice': {
        const notice = body as unknown as NewestNotice;
        return {
          notice_text: stripHtml(notice.noticeHtml ?? ''),
          notice_html: notice.noticeHtml ?? null,
        };
      }

      default:
        return body;
    }
  }
}
