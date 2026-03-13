/**
 * TMDB (The Movie Database) API v3 response types (UC-010).
 *
 * API host: api.themoviedb.org
 * Auth: Bearer token (v4 Read Access Token)
 * Base URL: https://api.themoviedb.org/3
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  adult: boolean;
  video: boolean;
  media_type?: string;
}

export interface TmdbTvShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids?: number[];
  genres?: TmdbGenre[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  origin_country: string[];
  media_type?: string;
}

export interface TmdbPerson {
  id: number;
  name: string;
  original_name?: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  gender: number;
  adult: boolean;
  known_for?: Array<TmdbMovie | TmdbTvShow>;
  media_type?: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  imdb_id?: string | null;
  homepage?: string | null;
  also_known_as?: string[];
  combined_credits?: {
    cast: TmdbCreditEntry[];
    crew: TmdbCreditEntry[];
  };
}

export interface TmdbGenre {
  id: number;
  name: string;
}

// ---------------------------------------------------------------------------
// Credits & Videos
// ---------------------------------------------------------------------------

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
  known_for_department: string;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export interface TmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
}

export interface TmdbCreditEntry {
  id: number;
  title?: string;
  name?: string;
  media_type: string;
  character?: string;
  job?: string;
  department?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  poster_path: string | null;
}

// ---------------------------------------------------------------------------
// Watch Providers
// ---------------------------------------------------------------------------

export interface TmdbWatchProvider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface TmdbWatchProviderCountry {
  link: string;
  flatrate?: TmdbWatchProvider[];
  rent?: TmdbWatchProvider[];
  buy?: TmdbWatchProvider[];
  ads?: TmdbWatchProvider[];
  free?: TmdbWatchProvider[];
}

export interface TmdbWatchProvidersResponse {
  id: number;
  results: Record<string, TmdbWatchProviderCountry>;
}

// ---------------------------------------------------------------------------
// Movie Details (with append_to_response)
// ---------------------------------------------------------------------------

export interface TmdbMovieDetails extends TmdbMovie {
  genres: TmdbGenre[];
  runtime: number | null;
  status: string;
  tagline: string | null;
  budget: number;
  revenue: number;
  imdb_id: string | null;
  homepage: string | null;
  production_companies: { id: number; name: string; logo_path: string | null; origin_country: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  spoken_languages: { iso_639_1: string; english_name: string; name: string }[];
  credits?: TmdbCredits;
  videos?: { results: TmdbVideo[] };
  'watch/providers'?: TmdbWatchProvidersResponse;
}

// ---------------------------------------------------------------------------
// Paginated Responses
// ---------------------------------------------------------------------------

export interface TmdbSearchMultiResult {
  media_type: string;
  id: number;
  [key: string]: unknown;
}

export interface TmdbSearchMultiResponse {
  page: number;
  results: TmdbSearchMultiResult[];
  total_pages: number;
  total_results: number;
}

export interface TmdbDiscoverResponse {
  page: number;
  results: Array<TmdbMovie | TmdbTvShow>;
  total_pages: number;
  total_results: number;
}

export interface TmdbTrendingResponse {
  page: number;
  results: Array<TmdbMovie | TmdbTvShow | TmdbPerson>;
  total_pages: number;
  total_results: number;
}

export interface TmdbPersonSearchResponse {
  page: number;
  results: TmdbPerson[];
  total_pages: number;
  total_results: number;
}
