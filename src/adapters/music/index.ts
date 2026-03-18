import { BaseAdapter } from '../base.adapter';
import {
  type ProviderRequest,
  type ProviderRawResponse,
  ProviderErrorCode,
} from '../../types/provider';
import type {
  MusicBrainzArtistSearchResponse,
  MbArtist,
  MusicBrainzReleaseSearchResponse,
  MbRelease,
  MusicBrainzRecordingSearchResponse,
  ListenBrainzFreshReleasesResponse,
  RadioBrowserStation,
} from './types';

/**
 * Music / Audio Discovery adapter (UC-018).
 *
 * Providers:
 *   MusicBrainz  — musicbrainz.org/ws/2 (CC0, 1 req/sec, User-Agent required)
 *   ListenBrainz — api.listenbrainz.org (CC0, no auth)
 *   RadioBrowser — de1.api.radio-browser.info (Public Domain, no auth)
 *
 * Supported tools (Phase 1, 7 atomic):
 *   music.artist_search    → MusicBrainz /ws/2/artist?query=
 *   music.artist_details   → MusicBrainz /ws/2/artist/{mbid}
 *   music.release_search   → MusicBrainz /ws/2/release?query=
 *   music.release_details  → MusicBrainz /ws/2/release/{mbid}
 *   music.recording_search → MusicBrainz /ws/2/recording?query=
 *   music.fresh_releases   → ListenBrainz /1/explore/fresh-releases/
 *   music.radio_search     → RadioBrowser /json/stations/search
 *
 * Auth: None. MusicBrainz requires User-Agent header.
 * All upstream APIs are free ($0 cost).
 */

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
const LISTENBRAINZ_BASE = 'https://api.listenbrainz.org';
const RADIOBROWSER_BASE = 'https://de1.api.radio-browser.info';
const USER_AGENT = 'APIbase/1.0 (https://apibase.pro; contact@apibase.pro)';

export class MusicAdapter extends BaseAdapter {
  constructor() {
    super({
      provider: 'music',
      baseUrl: MUSICBRAINZ_BASE,
    });
  }

  protected buildRequest(req: ProviderRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    const params = req.params as Record<string, unknown>;

    switch (req.toolId) {
      case 'music.artist_search':
        return this.buildArtistSearch(params);
      case 'music.artist_details':
        return this.buildArtistDetails(params);
      case 'music.release_search':
        return this.buildReleaseSearch(params);
      case 'music.release_details':
        return this.buildReleaseDetails(params);
      case 'music.recording_search':
        return this.buildRecordingSearch(params);
      case 'music.fresh_releases':
        return this.buildFreshReleases(params);
      case 'music.radio_search':
        return this.buildRadioSearch(params);
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
    const body = raw.body;

    switch (req.toolId) {
      case 'music.artist_search': {
        const data = body as MusicBrainzArtistSearchResponse;
        if (!data.artists || !Array.isArray(data.artists)) {
          throw new Error('Missing artists array in artist search response');
        }
        return data;
      }
      case 'music.artist_details': {
        const data = body as MbArtist;
        if (!data.id || !data.name) {
          throw new Error('Missing required fields in artist details response');
        }
        return data;
      }
      case 'music.release_search': {
        const data = body as MusicBrainzReleaseSearchResponse;
        if (!data.releases || !Array.isArray(data.releases)) {
          throw new Error('Missing releases array in release search response');
        }
        return data;
      }
      case 'music.release_details': {
        const data = body as MbRelease;
        if (!data.id || !data.title) {
          throw new Error('Missing required fields in release details response');
        }
        return data;
      }
      case 'music.recording_search': {
        const data = body as MusicBrainzRecordingSearchResponse;
        if (!data.recordings || !Array.isArray(data.recordings)) {
          throw new Error('Missing recordings array in recording search response');
        }
        return data;
      }
      case 'music.fresh_releases': {
        const data = body as ListenBrainzFreshReleasesResponse;
        if (!data.payload?.releases || !Array.isArray(data.payload.releases)) {
          throw new Error('Missing payload.releases in fresh releases response');
        }
        // Slice to limit — ListenBrainz returns 800KB+ without limit
        const params = req.params as Record<string, unknown>;
        const limit = typeof params.limit === 'number' ? params.limit : 50;
        data.payload.releases = data.payload.releases.slice(0, limit);
        return data;
      }
      case 'music.radio_search': {
        const data = body as RadioBrowserStation[];
        if (!Array.isArray(data)) {
          throw new Error('Expected array in radio search response');
        }
        return data;
      }
      default:
        return body;
    }
  }

  // ---------------------------------------------------------------------------
  // MusicBrainz request builders (User-Agent required on every request)
  // ---------------------------------------------------------------------------

  private mbHeaders(): Record<string, string> {
    return {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    };
  }

  private buildArtistSearch(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('query', String(params.query));
    qs.set('fmt', 'json');
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));

    return {
      url: `${MUSICBRAINZ_BASE}/artist?${qs.toString()}`,
      method: 'GET',
      headers: this.mbHeaders(),
    };
  }

  private buildArtistDetails(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const mbid = String(params.mbid);
    const qs = new URLSearchParams();
    qs.set('inc', 'url-rels+tags+ratings');
    qs.set('fmt', 'json');

    return {
      url: `${MUSICBRAINZ_BASE}/artist/${encodeURIComponent(mbid)}?${qs.toString()}`,
      method: 'GET',
      headers: this.mbHeaders(),
    };
  }

  private buildReleaseSearch(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('query', String(params.query));
    qs.set('fmt', 'json');
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));

    return {
      url: `${MUSICBRAINZ_BASE}/release?${qs.toString()}`,
      method: 'GET',
      headers: this.mbHeaders(),
    };
  }

  private buildReleaseDetails(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const mbid = String(params.mbid);
    const qs = new URLSearchParams();
    qs.set('inc', 'artist-credits+labels');
    qs.set('fmt', 'json');

    return {
      url: `${MUSICBRAINZ_BASE}/release/${encodeURIComponent(mbid)}?${qs.toString()}`,
      method: 'GET',
      headers: this.mbHeaders(),
    };
  }

  private buildRecordingSearch(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    qs.set('query', String(params.query));
    qs.set('fmt', 'json');
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));

    return {
      url: `${MUSICBRAINZ_BASE}/recording?${qs.toString()}`,
      method: 'GET',
      headers: this.mbHeaders(),
    };
  }

  // ---------------------------------------------------------------------------
  // ListenBrainz request builder
  // ---------------------------------------------------------------------------

  private buildFreshReleases(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    const days = typeof params.days === 'number' ? params.days : 7;
    qs.set('days', String(days));

    return {
      url: `${LISTENBRAINZ_BASE}/1/explore/fresh-releases/?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json' },
    };
  }

  // ---------------------------------------------------------------------------
  // RadioBrowser request builder
  // ---------------------------------------------------------------------------

  private buildRadioSearch(params: Record<string, unknown>): {
    url: string; method: string; headers: Record<string, string>;
  } {
    const qs = new URLSearchParams();
    if (params.name) qs.set('name', String(params.name));
    if (params.tag) qs.set('tag', String(params.tag));
    if (params.country) qs.set('country', String(params.country));
    if (params.countrycode) qs.set('countrycode', String(params.countrycode));
    if (params.language) qs.set('language', String(params.language));
    qs.set('limit', String(params.limit ?? 100));
    if (params.order) qs.set('order', String(params.order));
    if (params.hidebroken !== undefined) qs.set('hidebroken', params.hidebroken ? 'true' : 'false');

    return {
      url: `${RADIOBROWSER_BASE}/json/stations/search?${qs.toString()}`,
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    };
  }
}
