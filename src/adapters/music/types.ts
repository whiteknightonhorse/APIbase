/**
 * Music / Audio Discovery API response types (UC-018).
 *
 * Providers:
 *   MusicBrainz  — musicbrainz.org/ws/2 (CC0, User-Agent required, 1 req/sec)
 *   ListenBrainz — api.listenbrainz.org (CC0, no auth)
 *   RadioBrowser — de1.api.radio-browser.info (Public Domain, no auth)
 */

// ---------------------------------------------------------------------------
// MusicBrainz — Common
// ---------------------------------------------------------------------------

export interface MbArtistCredit {
  name: string;
  artist: { id: string; name: string; 'sort-name': string };
  joinphrase?: string;
}

export interface MbTag {
  count: number;
  name: string;
}

export interface MbRating {
  'votes-count': number;
  value: number | null;
}

export interface MbRelation {
  type: string;
  'type-id': string;
  url?: { resource: string; id: string };
  direction?: string;
}

export interface MbAlias {
  name: string;
  'sort-name': string;
  locale?: string | null;
  type?: string | null;
  primary?: boolean | null;
}

export interface MbLifeSpan {
  begin: string | null;
  end: string | null;
  ended: boolean;
}

export interface MbArea {
  id: string;
  name: string;
  'sort-name': string;
  'iso-3166-1-codes'?: string[];
}

// ---------------------------------------------------------------------------
// MusicBrainz — Artist
// ---------------------------------------------------------------------------

export interface MbArtist {
  id: string;
  type?: string | null;
  score?: number;
  name: string;
  'sort-name': string;
  country?: string | null;
  area?: MbArea | null;
  'begin-area'?: MbArea | null;
  'life-span'?: MbLifeSpan;
  tags?: MbTag[];
  aliases?: MbAlias[];
  relations?: MbRelation[];
  rating?: MbRating;
  disambiguation?: string;
  gender?: string | null;
}

export interface MusicBrainzArtistSearchResponse {
  created: string;
  count: number;
  offset: number;
  artists: MbArtist[];
}

// ---------------------------------------------------------------------------
// MusicBrainz — Release
// ---------------------------------------------------------------------------

export interface MbReleaseGroup {
  id: string;
  'type-id'?: string;
  'primary-type'?: string;
  title: string;
}

export interface MbLabelInfo {
  'catalog-number'?: string;
  label?: { id: string; name: string } | null;
}

export interface MbTrack {
  id: string;
  number: string;
  title: string;
  length: number | null;
  position: number;
  recording?: { id: string; title: string; length: number | null };
}

export interface MbMedia {
  position: number;
  format?: string | null;
  'track-count': number;
  tracks?: MbTrack[];
}

export interface MbRelease {
  id: string;
  score?: number;
  title: string;
  status?: string | null;
  date?: string | null;
  country?: string | null;
  barcode?: string | null;
  'track-count'?: number;
  'artist-credit'?: MbArtistCredit[];
  'release-group'?: MbReleaseGroup;
  media?: MbMedia[];
  'label-info'?: MbLabelInfo[];
  disambiguation?: string;
}

export interface MusicBrainzReleaseSearchResponse {
  created: string;
  count: number;
  offset: number;
  releases: MbRelease[];
}

// ---------------------------------------------------------------------------
// MusicBrainz — Recording
// ---------------------------------------------------------------------------

export interface MbRecording {
  id: string;
  score?: number;
  title: string;
  length: number | null;
  'first-release-date'?: string | null;
  'artist-credit'?: MbArtistCredit[];
  releases?: MbRelease[];
  disambiguation?: string;
}

export interface MusicBrainzRecordingSearchResponse {
  created: string;
  count: number;
  offset: number;
  recordings: MbRecording[];
}

// ---------------------------------------------------------------------------
// ListenBrainz — Fresh Releases
// ---------------------------------------------------------------------------

export interface LbRelease {
  artist_credit_name: string;
  release_name: string;
  release_date: string;
  release_group_primary_type?: string | null;
  caa_id?: number | null;
  listen_count?: number;
  release_mbid?: string | null;
  artist_mbids?: string[];
  release_group_mbid?: string | null;
}

export interface ListenBrainzFreshReleasesResponse {
  payload: {
    releases: LbRelease[];
  };
}

// ---------------------------------------------------------------------------
// RadioBrowser — Stations
// ---------------------------------------------------------------------------

export interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  codec: string;
  bitrate: number;
  votes: number;
  lastcheckok: number;
  clickcount: number;
  geo_lat: number | null;
  geo_long: number | null;
}
