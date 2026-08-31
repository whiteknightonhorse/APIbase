import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  LocalizedString,
  DataEuropaSearchEnvelope,
  DataEuropaCkanEnvelope,
  DataEuropaCkanPackageShowResult,
  DataEuropaVocabularyEnvelope,
  DataEuropaDatasetSearchOutput,
  DataEuropaDatasetDetailOutput,
  DataEuropaThemeListOutput,
  DataEuropaCatalogueListOutput,
} from './types';

const HUB_SEARCH_BASE = 'https://data.europa.eu/api/hub/search';
const SEARCH_INCLUDES =
  'id,title,description,catalog,country,categories,issued,modified,distributions';
// Safety cap on resources returned by dataset_detail — a handful of datasets in the
// portal have hundreds of distributions; num_resources still reflects the true total.
const MAX_DETAIL_RESOURCES = 30;
const COUNTRY_RE = /^[a-z]{2}$/;
const ID_RE = /^[A-Za-z0-9._-]{1,120}$/;

// Fixed 14-value data-theme vocabulary (verified live via /vocabularies/data-theme).
// The API silently returns zero results for an unrecognized theme code instead of an
// error, so the theme filter is enum-constrained at the schema layer to avoid a
// silent-empty footgun (same class as world-bank-cckp / bank-of-england).
const DATA_THEMES = [
  'AGRI',
  'ECON',
  'EDUC',
  'ENER',
  'ENVI',
  'GOVE',
  'HEAL',
  'INTR',
  'JUST',
  'OP_DATPRO',
  'REGI',
  'SOCI',
  'TECH',
  'TRAN',
] as const;

/**
 * European Union Open Data Portal Hub-Search API adapter (UC-642).
 *
 * Supported tools:
 *   data-europa.dataset_search  -> /search?filters=dataset      free-text/country/theme dataset discovery
 *   data-europa.dataset_detail  -> /ckan/package_show           full metadata + resource list for one dataset
 *   data-europa.theme_list      -> /vocabularies/data-theme     the 14-value DCAT-AP theme taxonomy
 *   data-europa.catalogue_list  -> /catalogues                  the ~211 national/regional/EU-institution portals
 *
 * Auth: None. Public Hub-Search API operated by the Publications Office of the EU
 * (data.europa.eu), aggregating 1M+ datasets from national/regional open-data portals
 * across the EU/EEA plus EU institutions. Most DCAT-AP metadata fields on /search are
 * multilingual objects (~25 languages per field) — normalized output flattens every
 * field to a single locale (default English) to keep responses agent-sized. The
 * /ckan/package_show CKAN-compatibility shim returns single-language strings natively
 * (in the source catalog's own language, not necessarily English) and does not support
 * a locale override.
 */
export class DataEuropaAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'data-europa',
      baseUrl: HUB_SEARCH_BASE,
      maxResponseBytes: 1_000_000,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
  } {
    const params = req.params as Record<string, unknown>;
    const headers: Record<string, string> = { Accept: 'application/json' };

    switch (req.toolId) {
      case 'data-europa.dataset_search': {
        const qs = new URLSearchParams();
        const query = params.query ? String(params.query).trim() : '';
        if (query) qs.set('q', query);
        qs.set('filters', 'dataset');
        qs.set('includes', SEARCH_INCLUDES);
        qs.set('limit', String(this.clamp(params.limit, 10, 1, 20)));

        const facets: Record<string, string[]> = {};
        const country = params.country ? String(params.country).trim().toLowerCase() : '';
        if (country) {
          if (!COUNTRY_RE.test(country)) {
            throw this.invalidInput(
              req.toolId,
              'country must be a 2-letter lowercase ISO code (e.g. "de", "fr", "it")',
            );
          }
          facets.country = [country];
        }
        const theme = params.theme ? String(params.theme).trim().toUpperCase() : '';
        if (theme) {
          if (!(DATA_THEMES as readonly string[]).includes(theme)) {
            throw this.invalidInput(
              req.toolId,
              `theme must be one of: ${DATA_THEMES.join(', ')} — see data-europa.theme_list`,
            );
          }
          facets.categories = [theme];
        }
        if (Object.keys(facets).length > 0) {
          qs.set('facets', JSON.stringify(facets));
        }
        return {
          url: `${HUB_SEARCH_BASE}/search?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'data-europa.dataset_detail': {
        const id = params.id ? String(params.id).trim() : '';
        if (!id || !ID_RE.test(id)) {
          throw this.invalidInput(
            req.toolId,
            'id is required (data.europa.eu dataset id, e.g. from dataset_search results)',
          );
        }
        const qs = new URLSearchParams({ id });
        return {
          url: `${HUB_SEARCH_BASE}/ckan/package_show?${qs.toString()}`,
          method: 'GET',
          headers,
        };
      }

      case 'data-europa.theme_list': {
        return {
          url: `${HUB_SEARCH_BASE}/vocabularies/data-theme`,
          method: 'GET',
          headers,
        };
      }

      case 'data-europa.catalogue_list': {
        return {
          url: `${HUB_SEARCH_BASE}/catalogues`,
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
    const params = req.params as Record<string, unknown>;
    const locale = params.locale ? String(params.locale).trim().toLowerCase() : 'en';

    switch (req.toolId) {
      case 'data-europa.dataset_search': {
        const env = raw.body as DataEuropaSearchEnvelope;
        const output: DataEuropaDatasetSearchOutput = {
          total: env.result.count ?? 0,
          returned: env.result.results.length,
          datasets: env.result.results.map((d) => {
            const distributions = d.distributions ?? [];
            const formats = [
              ...new Set(
                distributions
                  .map((dist) => dist.format?.label ?? dist.format?.id ?? null)
                  .filter((f): f is string => !!f),
              ),
            ];
            return {
              id: d.id,
              title: this.localize(d.title, locale),
              description: this.localize(d.description, locale),
              catalog_id: d.catalog?.id ?? null,
              catalog_title: this.localize(d.catalog?.title, locale),
              country: d.country?.label ?? d.country?.id ?? null,
              categories: (d.categories ?? []).map((c) => c.id),
              issued: d.issued ?? null,
              modified: d.modified ?? null,
              distribution_count: distributions.length,
              formats,
            };
          }),
        };
        return output;
      }

      case 'data-europa.dataset_detail': {
        const env = raw.body as DataEuropaCkanEnvelope<DataEuropaCkanPackageShowResult>;
        const p = env.result;
        const output: DataEuropaDatasetDetailOutput = {
          id: p.id,
          title: this.localize(p.title, locale),
          description: this.localize(p.notes, locale),
          catalog: p.organization?.id ?? null,
          catalog_title: this.localize(p.organization?.title, locale),
          tags: p.tags ?? [],
          license_id: p.license_id ?? null,
          num_resources: p.num_resources ?? (p.resources ?? []).length,
          metadata_created: p.metadata_created ?? null,
          metadata_modified: p.metadata_modified ?? null,
          distributions: (p.resources ?? []).slice(0, MAX_DETAIL_RESOURCES).map((r) => ({
            id: r.id,
            format: r.format ?? null,
            download_url: this.firstAccessUrl(r.access_url),
            license: this.localize(r.license?.label, locale) ?? r.license?.id ?? null,
            date_released: r.date_released ?? null,
            date_updated: r.date_updated ?? null,
          })),
        };
        return output;
      }

      case 'data-europa.theme_list': {
        const env = raw.body as DataEuropaVocabularyEnvelope;
        const output: DataEuropaThemeListOutput = {
          total: env.result.count ?? env.result.results.length,
          themes: env.result.results.map((t) => ({
            id: t.id,
            label: this.localize(t.pref_label, locale),
          })),
        };
        return output;
      }

      case 'data-europa.catalogue_list': {
        const all = raw.body as string[];
        const query = params.query ? String(params.query).trim().toLowerCase() : '';
        const limit = this.clamp(params.limit, 50, 1, 211);
        const filtered = query ? all.filter((c) => c.toLowerCase().includes(query)) : all;
        const output: DataEuropaCatalogueListOutput = {
          total: filtered.length,
          returned: Math.min(filtered.length, limit),
          catalogues: filtered.slice(0, limit),
        };
        return output;
      }

      default:
        return raw.body;
    }
  }

  private localize(value: LocalizedString | undefined | null, locale: string): string | null {
    if (value == null) return null;
    if (typeof value === 'string') return value.trim() || null;
    return value[locale] ?? value.en ?? Object.values(value)[0] ?? null;
  }

  /** ckan/package_show sometimes JSON-encodes access_url as a stringified array. */
  private firstAccessUrl(accessUrl: string | undefined): string | null {
    if (!accessUrl) return null;
    if (accessUrl.startsWith('[')) {
      try {
        const parsed = JSON.parse(accessUrl) as unknown;
        if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
      } catch {
        // fall through to raw string
      }
    }
    return accessUrl;
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
