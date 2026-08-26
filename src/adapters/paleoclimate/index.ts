import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type { PaleoSearchResponse, PaleoStudy, PaleoSite } from './types';

const PALEOCLIMATE_BASE = 'https://www.ncei.noaa.gov';
const SEARCH_RESULT_CAP = 20;

/**
 * NOAA NCEI Paleoclimatology adapter (UC-NNN).
 *
 * Supported tools (read-only):
 *   paleoclimate.study_search  → GET /access/paleo-search/study/search.json
 *   paleoclimate.study_detail  → GET /access/paleo-search/study/search.json?NOAAStudyId=...
 *
 * Auth: None (US Government open data, public domain — NOAA/NCEI).
 *
 * UPSTREAM QUIRK: the search endpoint has no pagination/limit parameter — a
 * broadly-filtered query (e.g. a single dataTypeId) can return 10-140MB of
 * JSON. maxResponseBytes is capped below the upstream worst case so overly
 * broad searches fail fast and cleanly (RESPONSE_TOO_LARGE) instead of
 * buffering tens of MB; the response is streamed and the read is aborted as
 * soon as the cap is exceeded (see base.adapter.ts), so this is a safe,
 * bounded-latency failure, not a hang. Agents should narrow with
 * locations/dataTypeId/searchText together to stay under the cap. Confirmed
 * empirically that min_year/max_year query params have no filtering effect
 * on this endpoint, so they are intentionally not exposed as tool params.
 */
export class PaleoclimateAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'paleoclimate',
      baseUrl: PALEOCLIMATE_BASE,
      maxResponseBytes: 8_000_000,
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
      case 'paleoclimate.study_search':
        return this.buildSearchRequest(params, headers);
      case 'paleoclimate.study_detail':
        return this.buildDetailRequest(params, headers);
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
    const data = raw.body as unknown as PaleoSearchResponse;
    const studies = data.study ?? [];

    switch (req.toolId) {
      case 'paleoclimate.study_search': {
        return {
          total_found: studies.length,
          count: Math.min(studies.length, SEARCH_RESULT_CAP),
          truncated: studies.length > SEARCH_RESULT_CAP,
          studies: studies.slice(0, SEARCH_RESULT_CAP).map((s) => this.condenseStudySummary(s)),
        };
      }
      case 'paleoclimate.study_detail': {
        const study = studies[0];
        if (!study) {
          throw {
            code: ProviderErrorCode.INVALID_RESPONSE,
            httpStatus: 404,
            message: 'No study found for the given NOAAStudyId',
            provider: this.provider,
            toolId: req.toolId,
            durationMs: raw.durationMs,
          };
        }
        return this.condenseStudyDetail(study);
      }
      default:
        return raw.body;
    }
  }

  // ---------------------------------------------------------------------------
  // Request builders
  // ---------------------------------------------------------------------------

  private buildSearchRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const qs = new URLSearchParams();
    if (params.searchText) qs.set('searchText', String(params.searchText));
    if (params.locations) qs.set('locations', String(params.locations));
    if (params.dataTypeId) qs.set('dataTypeId', String(params.dataTypeId));

    return {
      url: `${this.baseUrl}/access/paleo-search/study/search.json?${qs.toString()}`,
      method: 'GET',
      headers,
    };
  }

  private buildDetailRequest(
    params: Record<string, unknown>,
    headers: Record<string, string>,
  ): { url: string; method: string; headers: Record<string, string> } {
    const studyId = encodeURIComponent(String(params.NOAAStudyId ?? ''));
    return {
      url: `${this.baseUrl}/access/paleo-search/study/search.json?NOAAStudyId=${studyId}`,
      method: 'GET',
      headers,
    };
  }

  // ---------------------------------------------------------------------------
  // Response shaping
  // ---------------------------------------------------------------------------

  private condenseStudySummary(s: PaleoStudy) {
    return {
      noaa_study_id: s.NOAAStudyId,
      study_name: s.studyName,
      data_type: s.dataType,
      doi: s.doi,
      investigators: s.investigators,
      earliest_year_ce: s.earliestYearCE,
      most_recent_year_ce: s.mostRecentYearCE,
      locations: this.summarizeLocations(s.site),
      online_resource_link: s.onlineResourceLink,
    };
  }

  private condenseStudyDetail(s: PaleoStudy) {
    return {
      noaa_study_id: s.NOAAStudyId,
      study_name: s.studyName,
      data_type: s.dataType,
      doi: s.doi,
      version: s.version,
      investigators: s.investigators,
      earliest_year_ce: s.earliestYearCE,
      most_recent_year_ce: s.mostRecentYearCE,
      study_notes: s.studyNotes,
      online_resource_link: s.onlineResourceLink,
      data_license_url: s.dataLicenseUrl,
      publications: (s.publication ?? []).map((p) => ({
        author: p.author,
        year: p.pubYear,
        title: p.title,
        journal: p.journal,
        doi: p.doi,
      })),
      sites: (s.site ?? []).map((site) => ({
        site_name: site.siteName,
        location_name: site.locationName,
        latitude: site.geo?.properties?.southernmostLatitude ?? null,
        longitude: site.geo?.properties?.westernmostLongitude ?? null,
        elevation_meters: site.geo?.properties?.minElevationMeters ?? null,
        data_tables: (site.paleoData ?? []).map((t) => ({
          name: t.dataTableName,
          time_unit: t.timeUnit,
          earliest_year_ce: t.earliestYearCE,
          most_recent_year_ce: t.mostRecentYearCE,
          core_length_meters: t.coreLengthMeters,
          data_files: (t.dataFile ?? [])
            .filter((f) => f.fileUrl)
            .map((f) => ({ url: f.fileUrl, description: f.urlDescription ?? f.linkText })),
        })),
      })),
    };
  }

  private summarizeLocations(sites: PaleoSite[] | null): string[] {
    if (!sites) return [];
    const names = sites.map((site) => site.locationName).filter((n): n is string => Boolean(n));
    return [...new Set(names)];
  }
}
