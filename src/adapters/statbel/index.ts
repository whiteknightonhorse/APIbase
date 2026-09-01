import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { StatbelView, StatbelDataSource, StatbelViewFacts } from './types';

const STATBEL_BASE = 'https://bestat.statbel.fgov.be/bestat/api';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Statbel beSTAT public REST API adapter (UC-655).
 *
 * bestat.statbel.fgov.be serves the Belgian statistics office's curated data-dissemination
 * catalog: ~180 raw datasources, each publishing one or more of ~1300 ready-to-query "views"
 * (cross-tabs). No auth, no documented rate limit. Both /views and /datasources are flat list
 * endpoints that ignore all server-side query params — filtering/pagination is done client-side
 * here, same pattern as world-bank-cckp/bank-of-england. Each view is a SEPARATE record per
 * locale (distinct id per language, not a shared id with a language field); the view id already
 * encodes the language, so view_data needs no locale param. Invalid datasource ids return an
 * HTTP 200 with an empty body (silent-empty upstream behavior).
 *   statbel.list_views        -> browse curated views, filtered by locale + name search
 *   statbel.view_data         -> fetch the fact rows for one view (by id)
 *   statbel.list_datasources  -> browse raw datasources, filtered by name/description search
 *   statbel.datasource_detail -> fetch metadata for one datasource (by id)
 */
export class StatbelAdapter extends BaseAdapter {
  constructor() {
    super({ provider: 'statbel', baseUrl: STATBEL_BASE, maxResponseBytes: 3_000_000 });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'statbel.list_views':
        return {
          url: `${STATBEL_BASE}/views`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };

      case 'statbel.view_data': {
        const viewId = String(params.view_id || '').trim();
        if (!viewId) {
          throw this.invalidInput(req.toolId, 'view_id is required');
        }
        return {
          url: `${STATBEL_BASE}/views/${encodeURIComponent(viewId)}/result/JSON`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };
      }

      case 'statbel.list_datasources':
        return {
          url: `${STATBEL_BASE}/datasources`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        };

      case 'statbel.datasource_detail': {
        const datasourceId = String(params.datasource_id || '').trim();
        if (!datasourceId) {
          throw this.invalidInput(req.toolId, 'datasource_id is required');
        }
        return {
          url: `${STATBEL_BASE}/datasources/${encodeURIComponent(datasourceId)}`,
          method: 'GET',
          headers: { Accept: 'application/json' },
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
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'statbel.list_views': {
        const locale = String(params.locale || 'fr')
          .trim()
          .toLowerCase();
        const search = String(params.search || '')
          .trim()
          .toLowerCase();
        const limit = Math.min(Number(params.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Math.max(Number(params.offset) || 0, 0);

        const all = raw.body as StatbelView[];
        const filtered = all.filter((v) => {
          if (v.locale !== locale || !v.published) return false;
          if (search && !v.name.toLowerCase().includes(search)) return false;
          return true;
        });

        const page = filtered.slice(offset, offset + limit).map((v) => ({
          view_id: v.id,
          name: v.name,
          locale: v.locale,
          data_source_id: v.dataSourceId,
          last_published: new Date(v.lastPublishDate).toISOString(),
        }));

        return { total: filtered.length, count: page.length, offset, views: page };
      }

      case 'statbel.view_data': {
        const facts = raw.body as StatbelViewFacts;
        return { view_id: params.view_id, row_count: facts.length, facts };
      }

      case 'statbel.list_datasources': {
        const locale = params.locale ? String(params.locale).trim().toLowerCase() : undefined;
        const search = String(params.search || '')
          .trim()
          .toLowerCase();
        const limit = Math.min(Number(params.limit) || DEFAULT_LIMIT, MAX_LIMIT);
        const offset = Math.max(Number(params.offset) || 0, 0);

        const all = raw.body as StatbelDataSource[];
        const filtered = all.filter((ds) => {
          if (!ds.published) return false;
          if (locale && !ds.supportedLocales.includes(locale)) return false;
          if (search) {
            const haystack = `${ds.name} ${Object.values(ds.descriptions).join(' ')}`.toLowerCase();
            if (!haystack.includes(search)) return false;
          }
          return true;
        });

        const page = filtered.slice(offset, offset + limit).map((ds) => ({
          datasource_id: ds.id,
          name: ds.name,
          description: ds.descriptions[ds.defaultLocale] || Object.values(ds.descriptions)[0] || '',
          supported_locales: ds.supportedLocales,
          last_data_update: new Date(ds.lastDataUpdateDate).toISOString(),
        }));

        return { total: filtered.length, count: page.length, offset, datasources: page };
      }

      case 'statbel.datasource_detail': {
        const ds = raw.body as StatbelDataSource;
        return {
          datasource_id: ds.id,
          name: ds.name,
          descriptions: ds.descriptions,
          supported_locales: ds.supportedLocales,
          default_locale: ds.defaultLocale,
          category: ds.category,
          last_data_update: new Date(ds.lastDataUpdateDate).toISOString(),
          last_metadata_update: new Date(ds.lastMetadataDataUpdateDate).toISOString(),
        };
      }

      default:
        return raw.body;
    }
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
